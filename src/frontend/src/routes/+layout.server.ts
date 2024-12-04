import type { ServerLoad } from '@sveltejs/kit';

export const load: ServerLoad = async ({ locals }) => {
  try {
    const pb = locals.pb;
    
    // Load mission plans
    const missionPlansResponse = await pb.collection('mission_plans').getFullList();
    const loadedMission = missionPlansResponse.find((mission: any) => mission.isLoaded === 1);

    // Load blackbox logs (optional, can be moved to a separate API route)
    const blackboxLogs = await pb.collection('blackbox').getFullList({
      sort: '-created',
      perPage: 1000
    });

    return {
      loadedMission: loadedMission ? {
        id: loadedMission.id,
        title: loadedMission.title,
        actions: loadedMission.actions,
        isLoaded: loadedMission.isLoaded
      } : null,
      blackboxLogs: blackboxLogs.map((log: any) => ({
        id: log.id,
        log: log.log,
        created: log.created
      }))
    };
  } catch (error) {
    console.error('Error loading server-side data:', error);
    return {
      loadedMission: null,
      blackboxLogs: []
    };
  }
};
