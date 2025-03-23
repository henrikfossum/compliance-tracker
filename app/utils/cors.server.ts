// app/utils/cors.server.ts
// Use the global Response object instead of importing it as a type
export async function cors(request: Request): Promise<Response | null> {
    // Handle preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400", // 24 hours
        },
      });
    }
  
    // For actual requests, return null to continue processing
    return null;
  }