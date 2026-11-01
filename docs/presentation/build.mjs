// Editable slide source. See README.md for the artifact-tool runtime requirement.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../..');
const build = path.join(root, '.runtime/presentation-v3');
const runtimeModules = process.env.ARTIFACT_NODE_MODULES;
const skill = process.env.PRESENTATIONS_SKILL_DIR;
const python = process.env.ARTIFACT_PYTHON;
if (!runtimeModules || !skill || !python) throw new Error('Set ARTIFACT_NODE_MODULES, PRESENTATIONS_SKILL_DIR and ARTIFACT_PYTHON. See README.md.');
process.env.RUNTIME_NODE_MODULES = runtimeModules;
const {Presentation, PresentationFile} = await import(pathToFileURL(path.join(runtimeModules, '@oai/artifact-tool/dist/artifact_tool.mjs')).href);
const {finalizePresentation, resolvePresentationFont} = await import(pathToFileURL(path.join(skill, 'container_tools/artifact_tool_utils.mjs')).href);
await fs.mkdir(build, {recursive:true});
const content = JSON.parse(await fs.readFile(path.join(dir, 'content.json'), 'utf8'));
const p = Presentation.create({slideSize:{width:1280,height:720}});
const font = resolvePresentationFont({fontFamily:'Arial'});
const C = {ink:'#112A3A',paper:'#F4F7F6',navy:'#0B1C2C',mint:'#71E6BB',muted:'#526976',pale:'#A8BFC9'};
function text(s,value,x,y,w,h,size=30,color=C.ink,bold=false,name='') {
  const a=s.shapes.add({geometry:'textbox',name,position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
  a.text=value;a.text.style={fontSize:size,typeface:font,color,bold,insets:0,autoFit:'none',wrap:'square'};
  return a;
}
async function shot(s,name,x,y,w,h) {
  s.images.add({blob:new Uint8Array(await fs.readFile(path.join(dir,'assets',name))),contentType:'image/png',alt:`Captură reală FlyLeaf: ${name}`,fit:'contain',position:{left:x,top:y,width:w,height:h}});
}
for (const [i,d] of content.entries()) {
  const s=p.slides.add();const dark=d.dark||d.layout==='cover';
  s.background.fill=dark?C.navy:C.paper;
  const ink=dark?C.paper:C.ink, muted=dark?C.pale:C.muted, accent=dark?C.mint:C.ink;
  text(s,`${d.appendix?'Anexă  /  ':''}FlyLeaf  /  Flight Club`,64,670,1030,24,16,muted,false,'brand-footer');
  text(s,String(i+1).padStart(2,'0'),1170,670,55,24,16,muted,false,'page-number');
  s.speakerNotes.text=d.notes;
  if(d.layout==='cover') {
    text(s,d.title,70,125,1110,150,120,ink,true,'brand-title');
    text(s,d.subtitle,76,320,1120,66,42,C.mint,false,'tagline');
    text(s,d.body,76,442,1100,115,38,ink,false,'description');
    continue;
  }
  text(s,d.title,64,55,1152,130,48,ink,true,'slide-title');
  if(d.layout==='image') {
    // Screenshots are evidence, kept intact. Text stays editable.
    await shot(s,d.image,450,190,766,450);
    text(s,d.lead,64,205,355,120,31,ink,true,'lead');
    let y=345;
    for(const line of d.body.split('\n')) {text(s,line,64,y,355,60,25,muted,false,'feature');y+=70;}
    text(s,d.caption,450,640,766,25,18,muted,false,'image-caption');
  } else if(d.layout==='rows') {
    d.rows.forEach(([label,body],j)=>{
      const y=220+j*91;
      text(s,label,68,y,370,60,30,accent,true,'row-label');
      text(s,body,460,y,740,69,30,ink,false,'row-body');
    });
    text(s,d.footer,68,617,1140,40,24,muted,false,'takeaway');
  } else if(d.layout==='demo') {
    d.rows.forEach(([label,body],j)=>{
      const y=247+j*108;
      text(s,label,68,y,105,70,42,C.mint,true,'step-number');
      text(s,body,190,y,1000,85,34,ink,false,'step-body');
    });
    text(s,d.footer,190,610,1000,37,24,C.pale,false,'duration');
  } else if(d.layout==='closing') {
    text(s,d.lead,68,245,1125,150,36,ink,true,'lead');
    text(s,d.body,68,435,1120,130,29,muted,false,'pilot');
    text(s,d.footer,68,603,1120,45,30,ink,true,'team');
  }
}
const candidate = path.join(build,'candidate.pptx');
await (await PresentationFile.exportPptx(p)).save(candidate);
const finalPath = path.join(dir,process.env.FLYLEAF_DECK_FILENAME||'FlyLeaf-Product-Presentation-RO.pptx');
const result = await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath,
  explicitTotalSlideCount:content.length,requiredNativeTableOwnerSlides:[],requiredNativeChartOwnerSlides:[],
  pythonExecutable:python,integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit'],
  fontPolicy:{basis:'design',families:[font]},verifyArtifactToolImport:true,
  receiptPath:path.join(build,`${path.basename(finalPath)}.validation.json`)});
console.log(JSON.stringify({output:finalPath,slides:content.length,validated:!!result}));
for (let i=0;i<p.slides.items.length;i++) {
  const png=await p.export({slide:p.slides.items[i],format:'png',scale:1});
  await fs.writeFile(path.join(build,`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await png.arrayBuffer()));
}
const notes='# FlyLeaf — prezentare de cinci minute\n\n10 slide-uri principale, inclusiv 75 de secunde pentru demonstrație; 2 anexe pentru întrebări. Timpii sunt repere de repetiție.\n\n'+content.map((d,i)=>`## ${i+1}. ${d.title}\n\n${d.notes}\n`).join('\n');
await fs.writeFile(path.join(dir,'SPEAKER_NOTES_RO.md'),notes);
