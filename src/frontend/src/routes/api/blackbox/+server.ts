import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  const pb = locals.pb;
  
  try {
    const { log } = await request.json();
    
    // Create a new blackbox log entry
    const createdLog = await pb.collection('blackbox').create({ log });
    
    return new Response(JSON.stringify({ 
      success: true, 
      id: createdLog.id 
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error creating blackbox log:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const GET: RequestHandler = async ({ locals }) => {
  const pb = locals.pb;
  
  try {
    // Get total number of logs
    const totalLogs = await pb.collection('blackbox').getList(1, 1, { 
      filter: '',
      fields: 'totalItems'
    });

    // If more than 1000 logs, delete oldest logs
    if (totalLogs.totalItems > 1000) {
      const logsToDelete = await pb.collection('blackbox').getList(1, totalLogs.totalItems - 1000, {
        sort: 'created'
      });

      // Delete oldest logs
      const deletePromises = logsToDelete.items.map(log => 
        pb.collection('blackbox').delete(log.id)
      );
      
      await Promise.all(deletePromises);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Blackbox logs cleaned up',
      totalLogsDeleted: totalLogs.totalItems > 1000 ? totalLogs.totalItems - 1000 : 0
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error cleaning up blackbox logs:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
