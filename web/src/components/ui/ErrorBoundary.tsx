import { Component, type ComponentChildren, type ErrorInfo } from "preact";

interface Props {
  children: ComponentChildren;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-screen gap-3 bg-neutral-50 dark:bg-neutral-950">
          <p className="text-sm text-red-500 text-center max-w-md">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="px-3 py-1.5 text-xs rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
