export type SummaryData={kpis:{jobs:number;revenue:number;margin:number;on_time:number;turnaround:number;repeat_rate:number};byService:{service_id:number;revenue:number;margin:number;jobs:number;hours:number}[];monthly:{label:string;jobs:number}[];lateReasons:{name:string;jobs:number}[];utilization:{wd:number;utilization:number}[]};
export type ForecastData={month:string;n:number;lo:number;hi:number}[];
export type AtRiskCustomer={code:string;first_service:number;first_ticket:number;first_delay:number;days_since:number;risk:number};
const request=async<T>(path:string,body?:unknown,signal?:AbortSignal):Promise<T>=>{const response=await fetch('/api'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal});if(!response.ok)throw new Error('API request failed: '+response.status);return response.json() as Promise<T>};
const dateFor=(index:number,last=false)=>new Date(Date.UTC(2025,10+index+(last?1:0),last?0:1)).toISOString().slice(0,10);
export const dashboardApi={
 summary:(from:number,to:number,svc:number[]=[],mech=-1,signal?:AbortSignal)=>{const query=new URLSearchParams({from:dateFor(from),to:dateFor(to,true),svc:svc.length?svc.join(','):'0,1,2,3,4',mech:String(mech)});return request<SummaryData>('/summary?'+query,undefined,signal)},
 forecast:(growth:number,horizon=6,signal?:AbortSignal)=>request<{history:unknown[];forecast:ForecastData}>('/forecast?'+new URLSearchParams({growth:String(growth),horizon:String(horizon)}),undefined,signal),
 parts:(month:string,growth:number,signal?:AbortSignal)=>request<{month:string;jobs:number;parts:{name:string;units:number;perWeek:number;sigma:number;price:number}[]}>('/parts/forecast?'+new URLSearchParams({month,growth:String(growth)}),undefined,signal),
 churn:(signal?:AbortSignal)=>request<{model:{auc:number;coefs?:{name:string;coef:number}[]}|null;buckets:{bucket:number;no_return_rate:number}[];histogram:{bin:number;customers:number}[]}>('/churn/summary',undefined,signal),
 atRisk:(min:number,svc=-1,signal?:AbortSignal)=>request<AtRiskCustomer[]>('/churn/at-risk?'+new URLSearchParams({min:String(min/100),svc:String(svc),limit:'10'}),undefined,signal),
 labor:(body:{month:string;growth:number;surge:number;mechanics:number;hoursPerMechanic:number;minOverhauls:number},signal?:AbortSignal)=>request<{services:{name:string;demand:number;recommended:number}[];capacity:number;hoursUsed:number;hoursNeeded:number;weeklyMargin:number;baselineMargin:number;gainOverBaseline:number;valueOfExtraHour:number}>('/labor',body,signal),
 reorder:(body:{month:string;growth:number;surge:number;serviceLevel:number;leadDays:number},signal?:AbortSignal)=>request<{parts:{name:string;reorder:number;safetyCost:number;lead:number;safety:number}[]}>('/parts/reorder',body,signal),
 retention:(body:{response:number;cost:number},signal?:AbortSignal)=>request<{bestContacts:number;bestNetGain:number;points:{n:number;gain:number;extraReturns:number}[]}>('/retention',body,signal),
 downloadCsv:()=>requestBlob('/jobs.csv'),
};
async function requestBlob(path:string){const response=await fetch('/api'+path);if(!response.ok)throw new Error('API request failed');return response.blob()}
