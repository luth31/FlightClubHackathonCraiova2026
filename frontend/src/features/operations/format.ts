export const clock=(seconds:number|null|undefined)=>seconds==null?'—':`${String(8+Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds%3600/60)).padStart(2,'0')}`;
// Scenario timestamps are airport-local wall time, not the browser's timezone.
export const eventTime=(value:string|null|undefined)=>value?.split('T')[1]?.slice(0,8)||'—';
export const shortTime=(value:string|null|undefined)=>eventTime(value).slice(0,5);
export const dayLabel=(value:string)=>new Date(value+'T12:00:00').toLocaleDateString('ro-RO',{weekday:'long',day:'numeric',month:'long'});
export const statusLabels:Record<string,string>={completed:'Încheiat',departed:'Plecat',scheduled:'Programat',blocked:'Blocat',boarding:'Îmbarcare',active:'În desfășurare',in_progress:'În desfășurare',pending:'Așteaptă',upcoming:'Programat',arrived:'Sosit',arriving:'În apropiere'};
