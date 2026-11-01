export interface GraphLink {source:string; target:string; label?:string; kind?:string}

// Layout is determined by dependencies, never by event timestamps or list order.
export function dependencyLayout(ids:string[], edges:GraphLink[]) {
  const remaining=new Set(ids), levels=new Map<string,number>(), positions=new Map<string,{column:number;row:number}>();
  while(remaining.size){
    const ready=[...remaining].filter(id=>edges.filter(e=>e.target===id&&ids.includes(e.source)).every(e=>levels.has(e.source)));
    if(!ready.length){for(const id of remaining)levels.set(id,0);break}
    for(const id of ready){levels.set(id,Math.max(-1,...edges.filter(e=>e.target===id).map(e=>levels.get(e.source)??-1))+1);remaining.delete(id)}
  }
  const counts=new Map<number,number>();
  for(const id of ids){const column=levels.get(id)||0,row=counts.get(column)||0;positions.set(id,{column,row});counts.set(column,row+1)}
  return positions;
}
