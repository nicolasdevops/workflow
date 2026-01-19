require('dotenv').config();

const API_KEY = process.env.YOUCOM_API_KEY;
const AGENT_ID = process.env.YOUCOM_AGENT_ID;

if (!API_KEY || !AGENT_ID) {
    console.error("❌ Missing YOUCOM_API_KEY or YOUCOM_AGENT_ID in .env");
    process.exit(1);
}

async function runTest() {
    console.log(`🚀 Testing Agent ID: ${AGENT_ID}`);
    
    try {
        const response = await fetch('https://api.you.com/v1/agents/runs', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                agent: AGENT_ID,
                input: "Write a one sentence poem about resilience.",
                stream: false
            })
        });

        const data = await response.json();
        console.log("✅ Response Status:", response.status);
        console.log("📄 Raw Output:", JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("❌ Request Failed:", error.message);
    }
}

runTest();