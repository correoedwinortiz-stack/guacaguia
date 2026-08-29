import 'dotenv/config';

const apiKey = process.env.AIHUBMIX_API_KEY;

if (!apiKey) {
    console.error('Error: AIHUBMIX_API_KEY is not defined in .env');
    process.exit(1);
}

async function testAIHubMix() {
    console.log('Testing AIHubMix with model ox-alpha...');
    
    try {
        const response = await fetch('https://aihubmix.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'ox-alpha',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant.' },
                    { role: 'user', content: 'Hola! Por favor responde brevemente: ¿qué eres?' }
                ]
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorData}`);
        }

        const data = await response.json();
        console.log('\n--- Success! Response from AIHubMix ---');
        console.log('Model Used:', data.model);
        console.log('Message:', data.choices[0].message.content);
        console.log('---------------------------------------\n');
        
    } catch (error) {
        console.error('\n--- Error calling AIHubMix ---');
        console.error(error.message);
    }
}

testAIHubMix();
