import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// El Grimoire vive en la raíz de cerberus-real
const GRIMOIRE_PATH = path.resolve(__dirname, '../../cerberus_grimoire.json');

interface GrimoireRule {
    triggerKeywords: string[];
    resolutionRule: string;
    createdAt: string;
}

export class MemoryLayer {
    static getGrimoirePath() {
        if (!fs.existsSync(GRIMOIRE_PATH)) {
            fs.writeFileSync(GRIMOIRE_PATH, '[]');
        }
        return GRIMOIRE_PATH;
    }

    static async consultGrimoire(marketTitle: string): Promise<string> {
        try {
            const filePath = this.getGrimoirePath();
            const rawData = fs.readFileSync(filePath, 'utf-8');
            const rules: GrimoireRule[] = JSON.parse(rawData);

            const relevantRules = rules.filter(rule =>
                rule.triggerKeywords.some(keyword =>
                    marketTitle.toLowerCase().includes(keyword.toLowerCase())
                )
            );

            if (relevantRules.length === 0) return "";

            return `
[MEMORIA HISTÓRICA - PRECEDENTES]:
Este mercado coincide con reglas dictadas previamente por el Lord.
${relevantRules.map(r => `- CASO PREVIO: Si el título contiene [${r.triggerKeywords.join(', ')}], aplica esta regla: "${r.resolutionRule}"`).join('\n')}
`;
        } catch (error) {
            console.error("[MEMORY_LAYER] Error consultando el Grimoire:", error);
            return "";
        }
    }

    static async addRule(keywords: string[], rule: string) {
        try {
            const filePath = this.getGrimoirePath();
            let rules: GrimoireRule[] = [];

            if (fs.existsSync(filePath)) {
                const rawData = fs.readFileSync(filePath, 'utf-8');
                rules = JSON.parse(rawData);
            }

            rules.push({
                triggerKeywords: keywords.map(k => k.toLowerCase()),
                resolutionRule: rule,
                createdAt: new Date().toISOString()
            });

            fs.writeFileSync(filePath, JSON.stringify(rules, null, 2));
            console.log(`[MEMORY_LAYER] 🔱 Grimoire actualizado: Regla añadida para [${keywords.join(', ')}]`);
        } catch (error) {
            console.error("[MEMORY_LAYER] Error guardando regla en el Grimoire:", error);
        }
    }
}
