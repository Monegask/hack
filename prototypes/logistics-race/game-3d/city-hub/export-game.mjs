import fs from 'node:fs/promises';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {createCityHub} from './model.mjs';
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();}).catch(error=>this.onerror?.(error));}};
const model=createCityHub({serviceLane:true}),bytes=await new GLTFExporter().parseAsync(model,{binary:true,onlyVisible:true});
await fs.writeFile(__CITY_GAME_OUTPUT__,new Uint8Array(bytes));
