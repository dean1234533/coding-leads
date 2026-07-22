import { Component } from 'react';

// Without this, any render error (a bad lead field, an unexpected data
// shape) unmounts the whole React tree and leaves a blank/black screen with
// no way to tell what happened — especially bad on mobile, where there's no
// easy way to open devtools and read the actual error. This shows the real
// error message on screen instead, so it can just be read out/screenshotted.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] caught:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 px-6 text-center">
        <h1 className="text-lg font-semibold text-red-400">Something broke</h1>
        <p className="max-w-md text-sm text-gray-400">
          This screen crashed instead of loading. The error below is what actually went wrong — worth reading out or screenshotting if you need help with it.
        </p>
        <pre className="max-w-lg overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-gray-800 bg-gray-900 p-3 text-left text-xs text-red-300">
          {this.state.error?.message ?? String(this.state.error)}
        </pre>
        <button
          onClick={() => this.setState({ error: null })}
          className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2 text-sm font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400"
        >
          Try again
        </button>
      </div>
    );
  }
}
