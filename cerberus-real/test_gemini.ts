import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

async function test() {
    const key = "AIzaSyBk69dsJJTkopgvfssmsb_h_KWRWFbdyng";
    const genAI = new GoogleGenerativeAI(key);

    try {
        const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const listData = await listRes.json();

        const models = listData.models || [];
        const textModel = models.find((m: any) => m.supportedGenerationMethods.includes("generateContent"));

        if (!textModel) {
            console.error("No text models found!");
            return;
        }

        const modelName = textModel.name.split('/')[1];
        console.log(`Trying detected model: ${modelName}...`);

        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent("Hi");
        const response = await result.response;
        console.log(`✅ Success with ${modelName}:`, response.text().substring(0, 20));
    } catch (error: any) {
        console.error(`❌ Global error:`, error);
    }
}

test();
