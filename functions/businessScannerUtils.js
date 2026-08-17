'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;
const POSITIVE_CACHE_DAYS = 365;
const NEGATIVE_CACHE_DAYS = 60;

function sortBusinessLeads(leads) {
  return [...leads].sort((a, b) => {
    if (!!a.detailsUnavailable !== !!b.detailsUnavailable) return a.detailsUnavailable ? 1 : -1;
    if ((b.opportunityScore ?? 0) !== (a.opportunityScore ?? 0)) {
      return (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0);
    }
    return (a.reviewCount ?? Number.MAX_SAFE_INTEGER) - (b.reviewCount ?? Number.MAX_SAFE_INTEGER);
  });
}

function timestampToMillis(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function hasContactResult(cached) {
  return !!(cached?.email || cached?.ownerName || cached?.instagramUrl || cached?.whatsappUrl || cached?.facebookUrl);
}

function isLookupCacheFresh(cached, now = Date.now()) {
  if (!cached) return false;
  const checkedAt = timestampToMillis(cached.checkedAt);
  if (!checkedAt) return false;
  const maxAgeDays = hasContactResult(cached) ? POSITIVE_CACHE_DAYS : NEGATIVE_CACHE_DAYS;
  return now - checkedAt <= maxAgeDays * DAY_MS;
}

function unavailableLead(place) {
  return {
    id: place.place_id,
    name: place.name,
    address: place.formatted_address ?? place.vicinity ?? '',
    phone: null,
    website: null,
    googleMapsUrl: null,
    rating: place.rating ?? null,
    reviewCount: place.user_ratings_total ?? 0,
    types: place.types ?? [],
    hasWebsite: null,
    detailsUnavailable: true,
    opportunityScore: 0,
    opportunityLabel: 'Details unavailable — retry later',
    buyingIntent: 'Unknown',
    buyingIntentReason: 'Google Places details could not be verified, so this lead has not been scored.',
    ownerName: null,
    contactEmail: null,
    instagramUrl: null,
    whatsappUrl: null,
    facebookUrl: null,
    industryLabel: place.__industryLabel ?? null,
    competitorName: null,
    competitorRating: null,
    competitorReviewCount: null,
  };
}

module.exports = {
  isLookupCacheFresh,
  sortBusinessLeads,
  timestampToMillis,
  unavailableLead,
};
