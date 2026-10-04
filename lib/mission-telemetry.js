export const MISSION_FAILURE_OUTCOMES = new Set([
  'invalid_request', 'signed_out', 'forbidden', 'profile_missing',
  'conflict', 'verification_pending', 'rate_limited', 'unavailable',
  'request_failed', 'network_error', 'invalid_response',
]);
export const MISSION_DIAGNOSTIC_ACTIONS = ['accept', 'pass', 'complete', 'read_guide', 'started', 'blocked', 'verify_progress'];

export function missionFailureOutcome(status) {
  return ({
    400: 'invalid_request',
    401: 'signed_out',
    403: 'forbidden',
    404: 'profile_missing',
    409: 'conflict',
    422: 'verification_pending',
    429: 'rate_limited',
  })[status] || (status >= 500 ? 'unavailable' : 'request_failed');
}

export async function requestMissionJson({
  url, options, requestedEvent, failedEvent, properties, track, fetchImpl = fetch,
}) {
  track(requestedEvent, properties);
  let response;
  let data;
  try {
    response = await fetchImpl(url, options);
    data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Invalid mission response');
    }
  } catch (error) {
    track(failedEvent, {
      ...properties,
      outcome: response && !response.ok
        ? missionFailureOutcome(response.status)
        : response ? 'invalid_response' : 'network_error',
    });
    throw error;
  }
  if (!response.ok) {
    track(failedEvent, { ...properties, outcome: missionFailureOutcome(response.status) });
  }
  return { response, data };
}
