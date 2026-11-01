import type {FieldValues, ProcurementTemplate} from './types';
import './procurement.css';
export function TemplateFields({template,values,onChange,disabled=false}: {template?: ProcurementTemplate; values: FieldValues; onChange: (values: FieldValues)=>void; disabled?: boolean}) {
  if (!template) return null;
  return <div className="proc-template-fields form-grid">{template.fields.map(field=>{
    const value=values[field.key],text=value==null?'':String(value),set=(next:unknown)=>onChange({...values,[field.key]:next});
    return <label className={`field ${field.type==='textarea'?'proc-full':''} ${field.type==='boolean'?'proc-checkbox':''}`} key={field.key}>
      <span>{field.label}{field.required&&<span title="Necesar la validare"> *</span>}</span>
      {field.type==='textarea'?<textarea name={field.key} aria-label={field.label} value={text} disabled={disabled} rows={3} maxLength={6000} onChange={e=>set(e.target.value)}/>
        :field.type==='select'?<select name={field.key} aria-label={field.label} value={text} disabled={disabled} onChange={e=>set(e.target.value)}><option value="">Alege o valoare</option>{field.options?.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}</select>
        :field.type==='boolean'?<input name={field.key} aria-label={field.label} type="checkbox" checked={value===true} disabled={disabled} onChange={e=>set(e.target.checked)}/>
        :<input name={field.key} aria-label={field.label} type={field.type==='date'?'date':'text'} inputMode={field.type==='money'?'decimal':undefined} pattern={field.type==='money'?'-?(0|[1-9][0-9]*)([.][0-9]{1,2})?':undefined} maxLength={field.type==='money'?24:500} value={text} disabled={disabled} onChange={e=>set(e.target.value)}/>}
      {field.type==='money'&&<small>Sumă zecimală, maximum două zecimale. Moneda dosarului trebuie să coincidă.</small>}
    </label>;
  })}<p className="quiet-note proc-full">* Câmpuri necesare la validarea documentului. Ciorna poate fi incompletă.</p></div>;
}
