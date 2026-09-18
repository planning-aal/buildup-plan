import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Armana Group — Production Planning" },
      {
        name: "description",
        content:
          "Armana Apparels production planning: sewing plan import, SMV master, line capacity, working calendar and production buildup.",
      },
      { property: "og:title", content: "Armana Group — Production Planning" },
      {
        property: "og:description",
        content:
          "Sewing plan import, SMV master, line capacity, working calendar and production buildup for Armana Apparels Ltd.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  component: () => null,
});
