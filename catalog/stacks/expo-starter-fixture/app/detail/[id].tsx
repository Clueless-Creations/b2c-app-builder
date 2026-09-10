import { STATIC_DETAIL_IDS } from "../../src/navigation/route-graph";

export async function generateStaticParams() {
  return STATIC_DETAIL_IDS.map((id) => ({ id }));
}

export { DetailScreen as default } from "../../src/screens/detail";
