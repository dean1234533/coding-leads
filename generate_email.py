#!/usr/bin/env python3
import argparse
import os
from datetime import date

import requests
from bs4 import BeautifulSoup
import anthropic


def fetch_page_text(url: str, timeout: int = 10) -> str:
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
        resp = requests.get(url, headers=headers, timeout=timeout)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "head", "noscript"]):
            tag.decompose()
        return soup.get_text(separator=" ", strip=True)[:3000]
    except Exception as e:
        return f"[Could not fetch {url}: {e}]"


def fetch_site_content(base_url: str) -> str:
    base = base_url.rstrip("/")
    subpages = ["", "/about", "/about-us", "/services", "/contact"]

    chunks = []
    for path in subpages:
        url = base + path
        text = fetch_page_text(url)
        if not text.startswith("[Could not fetch"):
            chunks.append(f"=== {url} ===\n{text}")

    return "\n\n".join(chunks) if chunks else "[No content could be fetched from the website]"


def generate_email(company_name: str, website_url: str, owner_name: str) -> str:
    print("Fetching website content...")
    site_content = fetch_site_content(website_url)

    system_prompt = (
        "You are a seasoned Technical Consultant and Startup Advisor specializing in "
        "helping local businesses modernize their digital presence. Your outreach emails "
        "consistently achieve high reply rates because they are concise, human, "
        "personalized, and focused on business outcomes rather than technology."
    )

    user_prompt = f"""Here is the scraped content from the business website:

{site_content}

Now write a cold outreach email following these exact rules:

INPUTS:
- Business Name: {company_name}
- Website URL: {website_url}
- Owner Name: {owner_name}

INSTRUCTIONS:
1. Analyze the website content provided above.
2. Identify ONE specific observation that proves you actually visited the website. Examples:
   - No mobile app presence
   - Online booking requires a phone call
   - No online ordering or scheduling
   - Customer engagement opportunities
   - Loyalty program potential
   - Strong branding that could translate well into an app
   - Unique service that would benefit from mobile convenience
3. Never invent observations. If no meaningful observation is found, reference a specific service, product, or feature from the website.
4. Write exactly 3 sentences total in the email body.
5. Keep the total email body under 100 words.
6. Make the email sound like it was written by a real person, not an agency or AI.
7. Focus on business growth, customer retention, convenience, or revenue opportunities — not technical features.
8. Do not use buzzwords, hype, or sales language.

EMAIL STRUCTURE:
Sentence 1 (Context): Mention the business by name and reference the specific observation.
Sentence 2 (Authority — use EXACTLY this text, including the em dash):
I'm a local developer who recently published the "JS Grow Up" app to the Google Play Store — I help businesses avoid the tech headache by handling the entire process, from design and development through launch and store submission.
Sentence 3 (CTA — use EXACTLY this text, substituting the business name):
I have capacity for one new local project this month; would you be open to a quick 5-minute chat to see whether a mobile app could help {company_name} grow?

STYLE REQUIREMENTS:
- Professional and natural American-English
- Conversational, not corporate
- No emojis
- No bullet points
- No exclamation marks
- No openers like "I hope you're doing well"
- Avoid sounding like a marketing agency
- Vary sentence structure

OUTPUT FORMAT — output ONLY the following block, nothing else, no preamble, no explanation:
Subject: [Short curiosity-driven subject line under 6 words]

Hi {owner_name},

[Sentence 1] [Sentence 2] [Sentence 3]

Dean Burt
deanburt1308@gmail.com"""

    client = anthropic.Anthropic()

    print("Generating email with Claude...")
    with client.messages.stream(
        model="claude-opus-4-8",
        max_tokens=512,
        thinking={"type": "adaptive"},
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    ) as stream:
        result = stream.get_final_message()

    text_blocks = [b.text for b in result.content if b.type == "text"]
    return "\n".join(text_blocks).strip()


def append_lead(company_name: str, owner_name: str, website_url: str) -> None:
    leads_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "leads.md")
    today = date.today().isoformat()
    row = f"| {today} | {company_name} | {owner_name} | {website_url} |  |  |\n"

    if not os.path.exists(leads_path):
        with open(leads_path, "w") as f:
            f.write("# Lead Tracker\n\n")
            f.write("| Date | Business | Owner | Website | Email Sent | Reply |\n")
            f.write("|------|----------|-------|---------|------------|-------|\n")

    with open(leads_path, "a") as f:
        f.write(row)


def main():
    parser = argparse.ArgumentParser(
        description="Generate a personalized cold outreach email for a local business."
    )
    parser.add_argument("--company", required=True, help="Business name")
    parser.add_argument("--url", required=True, help="Business website URL")
    parser.add_argument("--owner", required=True, help="Owner's first name")
    parser.add_argument("--no-track", action="store_true", help="Skip adding to leads.md")
    args = parser.parse_args()

    if not args.url.startswith(("http://", "https://")):
        args.url = "https://" + args.url

    print()
    email = generate_email(args.company, args.url, args.owner)

    print()
    print("=" * 60)
    print(email)
    print("=" * 60)

    if not args.no_track:
        append_lead(args.company, args.owner, args.url)
        print(f"\nLead logged to leads.md")


if __name__ == "__main__":
    main()
