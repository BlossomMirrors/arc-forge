interface TurnstileGlobal {
	render: (
		container: HTMLElement,
		options: { sitekey: string; action: string; callback: (token: string) => void }
	) => string;
	reset: (widgetId: string) => void;
}

declare global {
	interface Window {
		turnstile?: TurnstileGlobal;
	}
}

export {};
