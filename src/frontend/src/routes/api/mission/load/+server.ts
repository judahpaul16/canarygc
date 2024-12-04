import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  const pb = locals.pb;
  
  try {
    const { actions, title } = await request.json();
    
    // First, reset all missions
    const existingMissions = await pb.collection('mission_plans').getFullList();
    const updatePromises = existingMissions.map(mission => 
      pb.collection('mission_plans').update(mission.id, { isLoaded: 0 })
    );
    await Promise.all(updatePromises);
    
    // Create or update the loaded mission
    const loadedMission = await pb.collection('mission_plans').create({
      title,
      actions,
      isLoaded: 1
    });
    
    // Send mission to mavlink via another API endpoint (if needed)
    const mavlinkResponse = await fetch("/api/mavlink/load_mission", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ actions })
    });
    
    if (!mavlinkResponse.ok) {
      throw new Error('Failed to load mission on mavlink');
    }

    return new Response(JSON.stringify({ 
      success: true, 
      mission: loadedMission 
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error loading mission:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
