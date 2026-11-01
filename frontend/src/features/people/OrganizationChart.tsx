import {useLayoutEffect, useRef} from 'react';
import {UsersRound} from 'lucide-react';
import {Tree, TreeNode} from 'react-organizational-chart';
import {organizationTree, type OrganizationNode} from './organization-tree';
import type {Directory} from './types';
import {PersonReference} from '@/components/people/PersonReference';

function OrganizationCard({node,leadership=false}:{node:OrganizationNode;leadership?:boolean}) {
  return <article className={`organization-card ${node.departmentId?'organization-card-department':''} ${leadership?'organization-card-leadership':''}`}
    data-person-id={node.personId} data-department-id={node.departmentId}>
    {node.departmentLabel&&<h3>{node.departmentLabel}</h3>}
    <strong>{node.personId?<PersonReference userId={node.personId} name={node.name}/>:node.name}</strong>
    {node.jobTitle&&<span>{node.jobTitle}</span>}
    {node.managerUnavailable&&<small>Coordonator indisponibil{node.managerName&&<>: <PersonReference userId={node.managerId} name={node.managerName}/></>}</small>}
  </article>;
}

function OrganizationBranch({node}:{node:OrganizationNode}) {
  return <TreeNode label={<OrganizationCard node={node}/>}>
    {node.children.map(child=><OrganizationBranch key={child.id} node={child}/>)}
  </TreeNode>;
}

function personCount(node:OrganizationNode):number {
  return Number(!!node.personId)+node.children.reduce((total,child)=>total+personCount(child),0);
}

export function OrganizationChart({directory}:{directory:Directory}) {
  const scroll=useRef<HTMLDivElement>(null);
  const root=organizationTree(directory);
  useLayoutEffect(()=>{
    const element=scroll.current;
    if(!element)return;
    const center=()=>{element.scrollLeft=Math.max(0,(element.scrollWidth-element.clientWidth)/2)};
    center();
    if(typeof ResizeObserver!=='undefined') {
      const observer=new ResizeObserver(center);observer.observe(element);
      return()=>observer.disconnect();
    }
    window.addEventListener('resize',center);
    return()=>window.removeEventListener('resize',center);
  },[]);
  return <section className="panel organization-chart" aria-label="Structura aeroportului">
    <div className="organization-title"><UsersRound size={19}/><h2>Structura aeroportului</h2>
      <span>{personCount(root)} persoane · {directory.department_records?.length||0} departamente</span>
    </div>
    <p className="organization-help">Glisează sau derulează orizontal pentru a vedea toate echipele.</p>
    <div ref={scroll} className="organization-scroll" tabIndex={0} role="region" aria-label="Organigramă — derulare orizontală">
      <div className="organization-canvas">
        <Tree label={<OrganizationCard node={root} leadership/>} lineWidth="2px" lineColor="#91aa9c" lineHeight="30px" nodePadding="8px" lineBorderRadius="8px">
          {root.children.map(node=><OrganizationBranch key={node.id} node={node}/>)}
        </Tree>
      </div>
    </div>
  </section>;
}
