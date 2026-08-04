export type Classification='Conforme'|'Não Conforme'|'Oportunidade de Melhoria'|'Risco';
export interface Unit {id?:number;name:string;active:boolean}
export interface Auditor {id?:number;name:string;role:string;active:boolean}
export interface Question {id?:number;requirement:string;text:string;active:boolean}
export interface Answer {id:string;questionId:number;requirement:string;question:string;classification:Classification;finding:string;recommendation:string;photos:string[]}
export interface Audit {id?:number;title:string;unit:string;auditors:string[];startDate:string;endDate:string;scope:string;objective:string;status:'Em andamento'|'Concluída';answers:Answer[];createdAt:string;updatedAt:string}
