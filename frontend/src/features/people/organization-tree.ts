import type {Directory, Person} from './types';

export interface OrganizationNode {
  id:string;
  name:string;
  personId?:string;
  jobTitle?:string;
  departmentId?:string;
  departmentLabel?:string;
  managerName?:string;
  managerId?:string;
  managerUnavailable?:boolean;
  children:OrganizationNode[];
}

type Member=Pick<Person,'id'|'name'|'active'|'job_title'|'department_id'|'manager_id'|'manager_name'>;

export function organizationTree(directory:Directory):OrganizationNode {
  const people=new Map<string,Member>(directory.items.filter(person=>person.active).map(person=>[person.id,person]));
  const inactive=new Set(directory.items.filter(person=>!person.active).map(person=>person.id));
  const leaders=(directory.organization_leaders||[]).filter(leader=>!inactive.has(leader.id));
  for(const leader of leaders) {
    if(!people.has(leader.id))people.set(leader.id,{...leader,active:true});
  }
  const nodes=new Map<string,OrganizationNode>();
  const personNodes=new Map<string,OrganizationNode>();
  for(const person of people.values()) {
    const node:OrganizationNode={id:`person:${person.id}`,personId:person.id,name:person.name,
      jobTitle:person.job_title,managerName:person.manager_name||undefined,managerId:person.manager_id||undefined,
      managerUnavailable:!!person.manager_id&&(!people.has(person.manager_id)||person.manager_id===person.id),children:[]};
    nodes.set(node.id,node);personNodes.set(person.id,node);
  }
  const root:OrganizationNode=leaders.length===1?personNodes.get(leaders[0].id)!:
    {id:'organization:airport',name:'Echipa aeroportului',children:[]};
  nodes.set(root.id,root);
  const departmentNodes=new Map<string,OrganizationNode>();
  for(const department of directory.department_records||[]) {
    if(departmentNodes.has(department.id))continue;
    const head=personNodes.get(department.head_user_id||'');
    const node:OrganizationNode=head&&!head.departmentId?head:
      {id:`department:${department.id}`,name:'Șef de numit',children:[]};
    node.departmentId=department.id;node.departmentLabel=department.label||department.name;
    nodes.set(node.id,node);departmentNodes.set(department.id,node);
  }
  const parents=new Map<string,string>();
  for(const node of nodes.values()) {
    if(node.id===root.id)continue;
    const person=node.personId?people.get(node.personId):undefined;
    const manager=personNodes.get(person?.manager_id||'');
    const department=departmentNodes.get(person?.department_id||'');
    const parent=manager&&manager.id!==node.id?manager:
      department&&department.id!==node.id?department:root;
    parents.set(node.id,parent.id);
  }
  // Malformed reporting cycles must not make a person disappear or recurse forever.
  for(const id of parents.keys()) {
    const seen=new Set<string>();let cursor=id;
    while(cursor!==root.id&&parents.has(cursor)) {
      if(seen.has(cursor)){parents.set(id,root.id);break;}
      seen.add(cursor);cursor=parents.get(cursor)!;
    }
  }
  for(const [id,parent] of parents)nodes.get(parent)!.children.push(nodes.get(id)!);
  function sort(node:OrganizationNode) {
    node.children.sort((a,b)=>Number(!!b.departmentId)-Number(!!a.departmentId)||
      (a.departmentLabel||a.name).localeCompare(b.departmentLabel||b.name,'ro'));
    node.children.forEach(sort);
  }
  sort(root);
  return root;
}
