import {procurementEnglish} from './procurement-en';
import {workspaceEnglish} from './workspace-en';
import {flowsEnglish} from './flows-en';
import {coreAEnglish} from './core-a-en';
import {coreBEnglish} from './core-b-en';
import {coreCEnglish} from './core-c-en';
import {peopleEnglish} from './people-en';
import {commonEnglish} from './common-en';
export const english:Record<string,string>={...coreAEnglish,...coreBEnglish,...coreCEnglish,...peopleEnglish,...commonEnglish,...flowsEnglish,...procurementEnglish,...workspaceEnglish};
