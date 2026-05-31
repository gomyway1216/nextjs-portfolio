/**
 * Selected Work — long-form case studies.
 *
 * Each entry is rendered both on the /work index and on its own
 * /work/[slug] page. Bodies are arrays of paragraphs so we don't have
 * to parse markdown at render time.
 *
 * Companies referenced indirectly ("a fintech company") to stay on the
 * safe side of confidentiality boundaries — the resume and LinkedIn
 * provide the explicit attribution for anyone investigating.
 */

export interface CaseStudySection {
  heading: string;
  body: string[];
}

export interface CaseStudy {
  slug: string;
  title: string;
  /** One-line pitch shown on the index card and as the page subtitle. */
  summary: string;
  /** Year or year range the work happened. */
  year: string;
  /** Short role label shown in project summaries. */
  role: string;
  /** Compact scope label for the case-study metadata rail. */
  scope: string;
  /** Outcome headline shown before the long-form details. */
  impact: string;
  /** Short tags shown as chips. */
  tags: string[];
  sections: CaseStudySection[];
}

export const caseStudies: CaseStudy[] = [
  {
    slug: 'internal-operations-platform',
    title:
      'Replacing a low-code platform with a custom internal operations app',
    summary:
      'Migrated an entire support and operations org off a third-party low-code tool onto a Next.js platform I designed end-to-end.',
    year: '2025',
    role: 'DRI, architecture and rollout',
    scope: 'RBAC, workflows, feature-flagged migration',
    impact: '100% support and operations migration',
    tags: ['Next.js', 'Internal Tools', 'TypeScript', 'RBAC', 'Fintech'],
    sections: [
      {
        heading: 'Context',
        body: [
          "At a fintech company, the support and operations org ran their daily workflows — user lookups, risk reviews, dispute handling, activity tracking — on a third-party low-code platform. As the team scaled, the tool's limitations became a real bottleneck: slow page loads, brittle authorization, expensive seat-based pricing, and custom logic that was hard to test or refactor.",
          "The org needed something they could iterate on at the speed of the rest of engineering, without paying a vendor for every new workflow.",
        ],
      },
      {
        heading: 'Approach',
        body: [
          "I designed and built a Next.js internal operations platform from scratch. The foundation was authentication and a role-based access control model aligned with the actual org structure — not the loose roles the prior tool offered.",
          "From there I migrated tooling module by module: users, risk reviews, dispute workflows, activity tracking. The migration ran in parallel with the legacy tool, maintaining UI parity so cutover was non-disruptive. Each module was added behind a feature flag, tested by a small group of operators, and then promoted.",
        ],
      },
      {
        heading: 'My role',
        body: [
          "Directly responsible individual. I owned the architecture, the rollout strategy, and the cross-team coordination with support and operations leadership. Engineering decisions, sequencing, training materials, the deprecation timeline of the old tool — all of it.",
        ],
      },
      {
        heading: 'Outcome',
        body: [
          "100% of the support and operations org migrated off the prior platform. Per-seat licensing cost dropped significantly. Page loads and iteration speed improved — feature work that used to take a sprint now ships in days.",
          "The component library built for this project has become the foundation for subsequent internal tools — every new ops surface starts from the same auth, RBAC, and layout primitives.",
        ],
      },
    ],
  },
  {
    slug: 'customer-support-architecture',
    title:
      'Multi-channel customer support architecture with LLM-assisted triage',
    summary:
      "Designed team-based ticket routing, retention flows, and the integration of an LLM library for understanding customer conversations.",
    year: '2025',
    role: 'Systems design and implementation lead',
    scope: 'Routing, retention, LLM signals, SLAs',
    impact: 'Automated routing for high-volume support teams',
    tags: ['Customer Support', 'LLM', 'Architecture', 'Fintech'],
    sections: [
      {
        heading: 'Context',
        body: [
          "A fintech company's support team handled inbound tickets through a shared inbox. Volume was growing faster than the team, response times were slipping, routing was inconsistent, and agents context-switched constantly between unrelated cases.",
          "The team needed structured routing, escalation rules for account-closure intent and dispute scenarios, and a way to use LLMs without rebuilding the conversation layer.",
        ],
      },
      {
        heading: 'Approach',
        body: [
          "I designed team-based ticket routing on a major customer-support platform — cases reach the right team based on customer attributes and content, not random round-robin. Retention and escalation logic now intercepts high-signal cases (closure intent, disputes) before they fall through.",
          "I also migrated the web cancel-flow to integrate directly with the support platform so retention attempts happen in-product, not over email. The LLM integration sits next to the routing layer: it extracts intent, sentiment, and urgency, and feeds those signals back into routing and SLA decisions.",
        ],
      },
      {
        heading: 'My role',
        body: [
          "Owned the end-to-end architecture. Partnered with support leadership on the workflow design — which queues, which escalation rules, which retention triggers — and was the DRI for the LLM integration.",
        ],
      },
      {
        heading: 'Outcome',
        body: [
          "Tickets now route automatically to the right team. The cancel flow integrates with retention attempts before churn, instead of after. And the LLM signals laid the groundwork for further AI-assisted support workflows the team is building on top.",
        ],
      },
    ],
  },
  {
    slug: 'payment-rails-integration',
    title: 'Integrating debit-card and cash deposit rails at a fintech company',
    summary:
      'Owned the end-to-end integration of two new payment rails to reduce involuntary churn from slow ACH funding.',
    year: '2025',
    role: 'Integration owner and vendor lead',
    scope: 'Payments, 3DS, reconciliation, disputes',
    impact: 'Faster funding paths with auditable money movement',
    tags: [
      'Payments',
      'ACH',
      '3DS',
      'Reconciliation',
      'Compliance',
      'Fintech',
    ],
    sections: [
      {
        heading: 'Context',
        body: [
          "A fintech company's funding paths relied heavily on ACH transfers, which take multiple business days to settle. New users hit a wall during onboarding — they wanted to fund their account immediately and couldn't, so they abandoned. The team needed faster funding methods that could coexist with the existing ACH infrastructure.",
        ],
      },
      {
        heading: 'Approach',
        body: [
          "I integrated two new payment rails: a debit-card-based instant deposit flow and an external cash deposit network. The work covered the full lifecycle — ACH file generation, reconciliation, chargebacks, 3DS authentication, fraud controls, partial-authorization handling.",
          "The harder parts were the edge cases: instant authorization that succeeds but settles late, partial settlements, chargebacks that arrive months later, reconciliation gaps between the rail's view of the world and ours. I designed retry and reconciliation logic for each of those, with audit trails so any operator can answer 'where is this money right now?' for any transaction.",
        ],
      },
      {
        heading: 'My role',
        body: [
          "DRI for the integration. Owned vendor evaluation, the architecture, the rollout, and the reconciliation system. Worked directly with the rails' integration engineers on edge cases that weren't in either of our specs.",
        ],
      },
      {
        heading: 'Outcome',
        body: [
          "Faster funding paths cut onboarding abandonment for funding-related drop-offs. Chargeback and dispute infrastructure now aligns with regulatory expectations, and the reconciliation system prevents the kind of silent money loss that's hard to spot until quarter-close.",
        ],
      },
    ],
  },
];

export function getCaseStudyBySlug(slug: string): CaseStudy | undefined {
  return caseStudies.find((cs) => cs.slug === slug);
}
