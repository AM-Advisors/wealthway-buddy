import { createFileRoute } from '@tanstack/react-router';
import { queryOptions } from '@tanstack/react-query';
import { getWealthServices } from '@/lib/wealth-services.functions';
import { WealthWorkspace } from '@/components/wealth-workspace';
export const Route=createFileRoute('/_authenticated/wealth')({
  loader:({context})=>context.queryClient.ensureQueryData(queryOptions({queryKey:['wealth-services'],queryFn:()=>getWealthServices()})),
  head:()=>({meta:[{title:'Personal Wealth & Fund Services | Harmonious'},{name:'description',content:'Private personal holdings, risk Report Cards and optional fund services.'},{property:'og:title',content:'Personal Wealth & Fund Services | Harmonious'},{property:'og:description',content:'Personal wealth records and optional Portfolio and Report Card services.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'},{name:'robots',content:'noindex'}]}),
  errorComponent:()=> <p className="p-8">Your wealth records could not be loaded. Refresh to try again.</p>,
  component:WealthWorkspace,
});