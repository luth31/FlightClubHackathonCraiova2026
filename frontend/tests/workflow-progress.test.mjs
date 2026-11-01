import test from 'node:test';
import assert from 'node:assert/strict';
import {documentProgress} from '../src/features/documents/workflow-progress.ts';

test('archiving an approved unsigned version does not claim it was signed',()=>{
  const steps=documentProgress({status:'archived',validated:true,workflow:{diagram:{version_signed:false}}});
  assert.equal(steps[2].state,'skipped');
  assert.equal(steps[2].note,'Nesemnat · arhivat');
  assert.equal(steps[3].state,'current');
});
test('a signed archived version keeps its completed signature',()=>{
  const steps=documentProgress({status:'archived',validated:true,workflow:{diagram:{version_signed:true}}});
  assert.equal(steps[2].state,'completed');
  assert.equal(steps[2].note,'Document semnat');
});
test('return for correction and a fresh version reset approval progress',()=>{
  const steps=documentProgress({status:'draft',validated:false});
  assert.equal(steps[1].state,'current');
  assert.equal(steps[1].note,'Verificarea datelor extrase');
  assert.equal(steps[2].state,'upcoming');
});
test('leave documents use their independent decision workflow',()=>{
  const steps=documentProgress({status:'approved',validated:true,managed_workflow:{type:'leave'},workflow:{steps:[{label:'Cerere înregistrată',status:'done'},{label:'Decizie independentă',status:'current'},{label:'Document de decizie',status:'pending'}]}});
  assert.deepEqual(steps.map(step=>step.state),['completed','current','upcoming']);
  assert.equal(steps.some(step=>step.label==='Semnare'),false);
});
