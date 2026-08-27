const ENGAGEMENT_EVENT_MAP = {
	agent_profile_shared: 'profile_shared',
	card_generated: 'card_generated',
	claim_completed: 'profile_claimed',
	comparison_started: 'comparison_started',
	identity_card_shared: 'profile_shared',
	mission_accepted: 'mission_accepted',
	mission_completed: 'mission_completed',
	mission_exhausted: 'mission_exhausted',
	mission_onboarding_completed: 'mission_onboarding_completed',
	mission_passed: 'mission_passed',
	mission_preview_requested: 'mission_preview_requested',
	mission_preview_shown: 'mission_preview_shown',
	mission_preview_signin_selected: 'mission_preview_signin_selected',
	mission_unavailable: 'mission_unavailable',
	mission_viewed: 'mission_viewed',
	next_action_selected: 'next_action_selected',
	profile_viewed: 'profile_viewed',
	recommendation_opened: 'recommendation_opened',
	session_restored: 'session_restored',
};
const ALLOWED_PROPERTIES = new Set(['action', 'channel', 'journey', 'source']);

function safeProperties(properties) {
	return Object.fromEntries(Object.entries(properties || {})
		.filter(([key, value]) => ALLOWED_PROPERTIES.has(key) && typeof value === 'string'));
}

function send(events) {
	if (typeof window === 'undefined' || events.length === 0) return;
	try {
		fetch('/api/engagement', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ events }),
			keepalive: true,
		}).catch(() => {});
		if (process.env.NEXT_PUBLIC_ANALYTICS_DEBUG === 'true') console.debug('[analytics]', events);
	} catch {
		// Analytics must never block the product action being measured.
	}
}

export function track(name, properties = {}) {
	if (typeof window === 'undefined') return;
	try {
		window.__DEVGLOBE_APP_INSIGHTS__?.trackEvent({ name }, safeProperties(properties));
	} catch {
		// Continue with durable ingestion when the optional RUM client fails.
	}
	const eventName = ENGAGEMENT_EVENT_MAP[name];
	if (!eventName) return;
	send([{
		eventName,
		targetLogin: properties.login,
		properties: safeProperties(properties),
	}]);
}

export function trackSearchAppearances(logins, source) {
	const events = [...new Set(logins.map(login => String(login || '').trim()).filter(Boolean))]
		.slice(0, 50)
		.map(targetLogin => ({
			eventName: 'search_appearance',
			targetLogin,
			properties: { source },
		}));
	send(events);
}