import fs from 'node:fs/promises';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {createAsphaltPlant} from '../src/asphalt-model.mjs';
import {articulateAsphalt} from '../src/asphalt-motion.mjs';
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();}).catch(error=>this.onerror?.(error));}};
const model=createAsphaltPlant();articulateAsphalt(model).update(0);const bytes=await new GLTFExporter().parseAsync(model,{binary:true,onlyVisible:false});
await fs.writeFile(__ASPHALT_GAME_OUTPUT__,new Uint8Array(bytes));
