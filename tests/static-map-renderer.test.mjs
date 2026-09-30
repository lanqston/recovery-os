import test from 'node:test';
import assert from 'node:assert/strict';
import {marketRenderer} from '../world-renderer.js';
test('simple map never creates a canvas context or allocates a drawing buffer',()=>{
 const canvas={dataset:{staticWorld:'true'},getContext(){throw new Error('GPU or canvas context requested')},set width(_){throw new Error('Canvas resized')},set height(_){throw new Error('Canvas resized')}};
 const renderer=marketRenderer(canvas,true);
 assert.equal(renderer.staticMap,true);
 renderer.setSize(430,932);renderer.setPixelRatio(3);renderer.render({},{});renderer.dispose();
 assert.equal(renderer.getPixelRatio(),1);
});
