import path from 'path';
import { promises as fs, readFile, writeFile } from 'fs';

const eslintConfigFile = path.resolve(__dirname, '.eslintrc.json');
const jsDir = path.resolve(__dirname, 'static/js');
const file = path.join(jsDir, process.argv[1]);

async function readFile(file: string): Promise<string> {
    return await fs.readFile(file, { encoding: 'utf8' });
}

async function writeFile(file: string, content: string) {
    return await fs.writeFile(file, content);
}