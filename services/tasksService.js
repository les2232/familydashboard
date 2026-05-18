import { getGoogleTasks } from './googleTasksService.js';
import { getCapturedItems } from './captureService.js';

function mergeTaskCollections(googleTasks = [], capturedItems = []) {
  return [...capturedItems, ...googleTasks];
}

function getAggregateSource({ googleSource, captureSource, hasGoogleError, hasCaptureError }) {
  if (hasGoogleError && hasCaptureError) return 'error';
  if (hasGoogleError || hasCaptureError || googleSource === 'fallback' || captureSource === 'fallback') return 'fallback';
  if (googleSource === 'cached' || captureSource === 'cached') return 'cached';
  return 'live';
}

export async function getTasks() {
  const [googleResult, captureResult] = await Promise.allSettled([
    getGoogleTasks(),
    getCapturedItems()
  ]);

  if (googleResult.status === 'rejected' && captureResult.status === 'rejected') {
    throw googleResult.reason || captureResult.reason;
  }

  const headers = ['status', 'description', 'category'];
  const tasks = mergeTaskCollections(
    googleResult.status === 'fulfilled' ? (googleResult.value.data?.tasks || []) : [],
    captureResult.status === 'fulfilled' ? (captureResult.value.data || []) : []
  );

  return {
    data: { headers, tasks },
    source: getAggregateSource({
      googleSource: googleResult.status === 'fulfilled' ? googleResult.value.source : 'error',
      captureSource: captureResult.status === 'fulfilled' ? captureResult.value.source : 'error',
      hasGoogleError: googleResult.status === 'rejected',
      hasCaptureError: captureResult.status === 'rejected'
    })
  };
}
