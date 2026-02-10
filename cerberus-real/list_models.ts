import 'dotenv/config';

async function listModels() {
    const key = process.env.LLM_API_KEY || "AIzaSyBk69dsJJTkopgvfssmsb_h_KWRWFbdyng";
    console.log("🔍 LISTING AUTHORIZED MODELS FOR KEY...");

    try {
        const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const listData = await listRes.json();

        if (listData.models) {
            console.log("\n--- AUTHORIZED MODELS ---");
            listData.models.forEach((m: any) => {
                console.log(`- ${m.name} (${m.displayName})`);
            });
        } else {
            console.log("No models found or error in response:", JSON.stringify(listData));
        }
    } catch (error: any) {
        console.error(`❌ Error listing models:`, error.message);
    }
}

listModels();
