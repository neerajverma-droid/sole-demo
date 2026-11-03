/**
 * The Widgets hub — the Tax Estimator plus the guides, calculators and
 * templates published on soleapp.com.au.
 *
 * Ported from the old app's /widget page. Everything here opens in a new tab
 * except the Tax Estimator, which is an app route.
 */
export type Widget = {
  id: number;
  title: string;
  description: string;
  /** An app route, or an absolute URL on the marketing site. */
  href: string;
  /** Cover photo on the marketing site. */
  image: string;
  /** Draws the pill over the cover. */
  featured?: boolean;
  /** Only shown to businesses in the Fitness and Wellbeing industry. */
  fitnessOnly?: boolean;
};

/** Industry id for Fitness and Wellbeing. */
export const FITNESS_INDUSTRY_ID = 7;

export const WIDGET_HREF = "/widget";

export const ALL_WIDGETS: Widget[] = [
  {
    id: 1,
    title: "Tax Estimator",
    description:
      "Instantly estimate your quarterly and annual tax with smart, accurate calculations. Simplify your financial planning with real-time insights.",
    href: "/tax-estimator",
    image: "https://soleapp.com.au/wp-content/uploads/2024/12/Understanding-PL-Statements.jpg",
    featured: true,
  },
  {
    id: 2,
    title: "Fitness Professional Start-up Guide",
    description:
      "A complete roadmap to launch your fitness business — from licensing and insurance to marketing and client acquisition.",
    href: "https://soleapp.com.au/resource/fitness-professional-start-up-guide/",
    image: "https://soleapp.com.au/wp-content/uploads/2023/02/About-2-1.webp",
    fitnessOnly: true,
  },
  {
    id: 3,
    title: "Fitness Goal & Revenue Calculator",
    description:
      "Plan your success! Set realistic business goals, forecast revenue, and build a sustainable model for your fitness journey.",
    href: "https://soleapp.com.au/resource/fitness-professionals-goal-and-revenue-calculator/",
    image: "https://soleapp.com.au/wp-content/uploads/2024/06/Fitness-1.webp",
    fitnessOnly: true,
  },
  {
    id: 4,
    title: "Client Capacity Calculator",
    description:
      "Find your perfect balance between clients and quality. Discover your optimal workload and prevent burnout while maximizing earnings.",
    href: "https://soleapp.com.au/resource/client-capacity-calculator-for-fitness-professionals/",
    image: "https://soleapp.com.au/wp-content/uploads/2024/06/Cleaning-1.webp",
    fitnessOnly: true,
  },
  {
    id: 5,
    title: "Sole's Business Guide",
    description:
      "Learn how to manage your clients, set your pricing strategy, and position your business for growth with Sole's step-by-step guide.",
    href: "https://soleapp.com.au/resource/soles-business-guide/",
    image: "https://soleapp.com.au/wp-content/uploads/2024/09/My-Sole-Guide-2024-1-1280x780.webp",
    featured: true,
  },
  {
    id: 6,
    title: "Calculating Your Taxable Income",
    description:
      "Understand how to calculate your taxable income accurately. Learn what counts as income and which expenses you can deduct.",
    href: "https://soleapp.com.au/resource/calculating-your-taxable-income/",
    image: "https://soleapp.com.au/wp-content/uploads/2024/08/retail-shop-1280x854.webp",
  },
  {
    id: 7,
    title: "Claiming Business Expenses",
    description:
      "Discover which expenses are tax-deductible and how to keep compliant records to maximise your business deductions.",
    href: "https://soleapp.com.au/resource/claiming-business-expenses/",
    image: "https://soleapp.com.au/wp-content/uploads/2024/06/Customer-10.webp",
  },
  {
    id: 8,
    title: "Managing BAS & PAYG",
    description:
      "Stay ahead on your obligations with step-by-step guidance for BAS and PAYG. Simplify reporting and stay compliant all year round.",
    href: "https://soleapp.com.au/resource/managing-bas-payg/",
    image: "https://soleapp.com.au/wp-content/uploads/2024/06/Customer-3.webp",
  },
  {
    id: 9,
    title: "Filing Your Tax Return",
    description:
      "A practical walkthrough to help you file your tax return accurately and efficiently — with confidence and fewer surprises.",
    href: "https://soleapp.com.au/resource/filing-your-tax-return/",
    image: "https://soleapp.com.au/wp-content/uploads/2024/06/Customer-8.webp",
  },
  {
    id: 10,
    title: "Sole's Best Tips to Maximise Your Tax Return",
    description:
      "Expert strategies to ensure you claim all eligible deductions and make the most of your next tax return.",
    href: "https://soleapp.com.au/resource/soles-best-tips-to-maximise-your-tax-return/",
    image: "https://soleapp.com.au/wp-content/uploads/2023/07/ads4-2.webp",
  },
  {
    id: 11,
    title: "Time & Money Saver Calculator",
    description:
      "Calculate how much time and money you save by using Sole's automated accounting features instead of manual processes.",
    href: "https://soleapp.com.au/resource/time-saver-calculator/",
    image: "https://soleapp.com.au/wp-content/uploads/2024/12/Understanding-PL-Statements.jpg",
  },
  {
    id: 12,
    title: "Planning for Profit Calculator",
    description:
      "Set your income goals and work backwards to determine the revenue and clients you need to achieve your financial targets.",
    href: "https://soleapp.com.au/resource/planning-for-profit-calculator/",
    image: "https://soleapp.com.au/wp-content/uploads/2024/06/Fitness-1.webp",
  },
  {
    id: 13,
    title: "Pricing Calculator",
    description:
      "Determine the right pricing for your services by factoring in costs, desired profit margins, and market rates.",
    href: "https://soleapp.com.au/resource/pricing-calculator/",
    image: "https://soleapp.com.au/wp-content/uploads/2024/06/Customer-8.webp",
  },
  {
    id: 14,
    title: "Client Consultations Required Calculator",
    description:
      "Calculate how many client consultations you need to conduct to reach your client growth targets and business goals.",
    href: "https://soleapp.com.au/resource/client-consultations-required-calculator-for-fitness-professionals/",
    image: "https://soleapp.com.au/wp-content/uploads/2024/06/Fitness-1.webp",
    fitnessOnly: true,
  },
  {
    id: 15,
    title: "Sole Trader Start-up Guide",
    description:
      "Everything you need to know to start your sole trader business in Australia — from registration to your first client.",
    href: "https://soleapp.com.au/resource/the-sole-trader-start-up-guide/",
    image: "https://soleapp.com.au/wp-content/uploads/2023/02/About-sole.webp",
  },
  {
    id: 16,
    title: "Freelancers Start-up Guide",
    description:
      "Essential information for freelancers to establish their business structure, manage finances, and grow their client base.",
    href: "https://soleapp.com.au/resource/freelancers-start-up-guides/",
    image: "https://soleapp.com.au/wp-content/uploads/2024/06/Customer-1.webp",
  },
  {
    id: 17,
    title: "Understanding GST for Sole Traders",
    description:
      "Learn when you need to register for GST, how to charge it, and how to claim GST credits on your business expenses.",
    href: "https://soleapp.com.au/resource/gst-for-sole-traders/",
    image: "https://soleapp.com.au/wp-content/uploads/2024/06/Customer-15.webp",
  },
  {
    id: 18,
    title: "Small Business Tax 101",
    description:
      "The ultimate guide to understanding Australian small business tax obligations, deductions, and compliance requirements.",
    href: "https://soleapp.com.au/resource/small-business-tax-101/",
    image: "https://soleapp.com.au/wp-content/uploads/2024/06/Education-1.webp",
  },
  {
    id: 19,
    title: "Key Tax Terms",
    description:
      "Decode the jargon! Understand essential Australian tax terminology including GST, BAS, PAYG, and EOFY.",
    href: "https://soleapp.com.au/resource/key-tax-terms/",
    image: "https://soleapp.com.au/wp-content/uploads/2024/08/creative-1280x853.webp",
  },
  {
    id: 20,
    title: "Maximise Hairdresser Tax Returns",
    description:
      "Specific tax tips for solo hairdressers to maximise deductions on tools, products, training, and work-related expenses.",
    href: "https://soleapp.com.au/resource/soles-best-tips-to-maximise-solo-hairdressers-tax-returns/",
    image: "https://soleapp.com.au/wp-content/uploads/2023/10/hairdressers1.webp",
  },
  {
    id: 21,
    title: "Download Free Invoice Templates",
    description:
      "Professional invoice templates for Word and Excel designed for Australian small businesses and sole traders.",
    href: "https://soleapp.com.au/resource/invoice-templates/",
    image: "https://soleapp.com.au/wp-content/uploads/2024/06/Contractors-1.webp",
  },
  {
    id: 22,
    title: "Download Quote Templates",
    description:
      "Ready-to-use quote templates to send professional proposals to your clients quickly and easily.",
    href: "https://soleapp.com.au/resource/quote-templates/",
    image: "https://soleapp.com.au/wp-content/uploads/2024/08/creative-1280x853.webp",
  },
  {
    id: 23,
    title: "ChatGPT Playbook for Small Business",
    description:
      "Leverage AI to automate tasks, improve customer service, create content, and streamline your business operations.",
    href: "https://soleapp.com.au/resource/chatgpt-playbook-small-business/",
    image: "https://soleapp.com.au/wp-content/uploads/2025/01/Adopt-A-Flexible-Workspace-Model-1280x754.jpg",
  },
  {
    id: 24,
    title: "Business Systems Blueprint",
    description:
      "Build efficient, scalable systems for your small service business to reduce manual work and improve consistency.",
    href: "https://soleapp.com.au/resource/business-systems-blueprint/",
    image: "https://soleapp.com.au/wp-content/uploads/2025/01/Adopt-A-Flexible-Workspace-Model-1280x754.jpg",
  },
  {
    id: 25,
    title: "Quote Prompt Template",
    description:
      "Use this AI prompt template to generate professional, accurate quotes for your small service business in seconds.",
    href: "https://soleapp.com.au/resource/quote-prompt-template/",
    image: "https://soleapp.com.au/wp-content/uploads/2023/02/Pricing.webp",
  },
  {
    id: 26,
    title: "Integrating with a POS System",
    description:
      "Learn how to connect your Point of Sale system with Sole for automatic transaction feeds and simplified bookkeeping.",
    href: "https://soleapp.com.au/resource/integrating-with-a-pos-system/",
    image: "https://soleapp.com.au/wp-content/uploads/2024/06/Ecommerce-1.webp",
  },
  {
    id: 27,
    title: "NDIS Invoice Guide & Software",
    description:
      "Complete guide to NDIS invoicing requirements and how to use Sole to create compliant invoices for NDIS providers.",
    href: "https://soleapp.com.au/resource/ndis-invoice-guide-software-for-australian-providers/",
    image: "https://soleapp.com.au/wp-content/uploads/2025/07/business-owner-5-1280x853.webp",
  },
  {
    id: 28,
    title: "Pricing Template - Trades & Field Services",
    description:
      "Industry-specific pricing benchmarks for trades and field service professionals to set competitive, profitable rates.",
    href: "https://soleapp.com.au/resource/pricing-template-trades-2/",
    image: "https://soleapp.com.au/wp-content/uploads/2023/02/Partners-2-1.webp",
  },
  {
    id: 29,
    title: "Pricing Template - Fitness & Health",
    description:
      "Pricing guidance for fitness, health, and care professionals including hourly rates, packages, and session pricing.",
    href: "https://soleapp.com.au/resource/pricing-template-fitness/",
    image: "https://soleapp.com.au/wp-content/uploads/2023/10/Rate-My-Trainer-16-1280x960.webp",
    fitnessOnly: true,
  },
  {
    id: 30,
    title: "Pricing Template - Creative & Media",
    description:
      "Pricing benchmarks for creative and media professionals including project rates, hourly fees, and retainer models.",
    href: "https://soleapp.com.au/resource/pricing-template-creatives/",
    image: "https://soleapp.com.au/wp-content/uploads/2023/02/Home-2.webp",
  },
  {
    id: 31,
    title: "Pricing Template - Professional Services",
    description:
      "Pricing framework for professional service providers including hourly rates, retainers, and fixed-fee structures.",
    href: "https://soleapp.com.au/resource/pricing-template-professional-services/",
    image: "https://soleapp.com.au/wp-content/uploads/2023/02/Roadmap-1.webp",
  },
  {
    id: 32,
    title: "Pricing Template - Retail & eCommerce",
    description:
      "Pricing strategies for retail, eCommerce, and manufacturing businesses including markup, margins, and cost-plus pricing.",
    href: "https://soleapp.com.au/resource/pricing-template-retail/",
    image: "https://soleapp.com.au/wp-content/uploads/2023/02/solemates1.webp",
  },
  {
    id: 33,
    title: "Pricing Template - Personal Services",
    description:
      "Pricing guidance for personal and general service providers with hourly rate benchmarks and service packages.",
    href: "https://soleapp.com.au/resource/pricing-template-personal-services/",
    image: "https://soleapp.com.au/wp-content/uploads/2024/06/Customer-9.webp",
  },
  {
    id: 34,
    title: "Pricing Template - Property Management",
    description:
      "Pricing benchmarks for property management and investment services including commission rates and inspection fees.",
    href: "https://soleapp.com.au/resource/pricing-template-property-management/",
    image: "https://soleapp.com.au/wp-content/uploads/2023/02/Partners-3.webp",
  },
  {
    id: 35,
    title: "Job Scheduling - Trades & Field Services",
    description:
      "Optimize your scheduling workflow for trades and field service work to maximize efficiency and minimize downtime.",
    href: "https://soleapp.com.au/resource/job-scheduling-process-trades/",
    image: "https://soleapp.com.au/wp-content/uploads/2023/02/Contact-1.webp",
  },
  {
    id: 36,
    title: "Session Scheduling - Fitness & Health",
    description:
      "Streamline your session scheduling for fitness, health, and care services to reduce no-shows and optimize your calendar.",
    href: "https://soleapp.com.au/resource/session-scheduling-process-fitness/",
    image: "https://soleapp.com.au/wp-content/uploads/2023/09/Indigenous-austrlians-in-business.webp",
    fitnessOnly: true,
  },
  {
    id: 37,
    title: "Project Scheduling - Creative & Media",
    description:
      "Manage creative project timelines effectively with this scheduling framework for photographers, designers, and media pros.",
    href: "https://soleapp.com.au/resource/project-scheduling-process-creatives/",
    image: "https://soleapp.com.au/wp-content/uploads/2023/02/Home-2_S.webp",
  },
  {
    id: 38,
    title: "Client Scheduling - Professional Services",
    description:
      "Optimize appointment scheduling for professional service providers to maximize billable hours and client satisfaction.",
    href: "https://soleapp.com.au/resource/client-scheduling-process-professional-services/",
    image: "https://soleapp.com.au/wp-content/uploads/2023/02/Accountant-Bookeeper_S.webp",
  },
  {
    id: 39,
    title: "Order Scheduling - Retail & eCommerce",
    description:
      "Manage fulfillment capacity and batch production scheduling for retail, eCommerce, and manufacturing businesses.",
    href: "https://soleapp.com.au/resource/scheduling-process-retail-ecommerce-manufacturing/",
    image: "https://soleapp.com.au/wp-content/uploads/2025/04/worldpay2-1280x725.webp",
  },
  {
    id: 40,
    title: "Appointment Scheduling - Personal Services",
    description:
      "Create an efficient appointment scheduling system for personal and general service providers.",
    href: "https://soleapp.com.au/resource/appointment-scheduling-process-personal-services/",
    image: "https://soleapp.com.au/wp-content/uploads/2023/02/Sole-vs-Other-Apps_S.webp",
  },
  {
    id: 41,
    title: "Property Inspection Scheduling",
    description:
      "Schedule annual property cycles and routine inspection workflows for investment property management.",
    href: "https://soleapp.com.au/resource/investment-property-management-scheduling-process/",
    image: "https://soleapp.com.au/wp-content/uploads/2023/01/Sole-app-user-14.webp",
  },
  {
    id: 42,
    title: "Pre-Job Checklist - Trades",
    description:
      "Ensure you have everything ready before starting a trade job with this comprehensive pre-job checklist.",
    href: "https://soleapp.com.au/resource/pre-job-checklist-trades/",
    image: "https://soleapp.com.au/wp-content/uploads/2025/07/MCC_VERTICALS_-_Retail__1_-1280x1280.jpg",
  },
  {
    id: 43,
    title: "Pre-Session Checklist - Fitness",
    description:
      "Prepare for client training sessions with this pre-session checklist for fitness and health professionals.",
    href: "https://soleapp.com.au/resource/pre-session-checklist-fitness/",
    image: "https://soleapp.com.au/wp-content/uploads/2025/06/hairdresser.webp",
    fitnessOnly: true,
  },
  {
    id: 44,
    title: "Pre-Project Checklist - Creatives",
    description:
      "Start creative projects right with this comprehensive checklist for photographers, designers, and media professionals.",
    href: "https://soleapp.com.au/resource/pre-project-checklist-creatives/",
    image: "https://soleapp.com.au/wp-content/uploads/2023/02/Home-2_S.webp",
  },
  {
    id: 45,
    title: "Pre-Engagement Checklist - Professional Services",
    description:
      "Confirm meeting agendas, access credentials, and payment terms before professional service engagements.",
    href: "https://soleapp.com.au/resource/pre-engagement-checklist-professional-services/",
    image: "https://soleapp.com.au/wp-content/uploads/2025/06/professional5.webp",
  },
  {
    id: 46,
    title: "Pre-Task Checklist - Retail & Manufacturing",
    description:
      "Prepare for production and fulfillment tasks with this checklist for retail, eCommerce, and manufacturing teams.",
    href: "https://soleapp.com.au/resource/pre-task-checklist-retail/",
    image: "https://soleapp.com.au/wp-content/uploads/2025/04/worldpay2-1280x725.webp",
  },
  {
    id: 47,
    title: "Pre-Appointment Checklist - Personal Services",
    description:
      "Ensure smooth service delivery with this pre-appointment checklist for personal and general service providers.",
    href: "https://soleapp.com.au/resource/pre-appointment-checklist-personal-services/",
    image: "https://soleapp.com.au/wp-content/uploads/2025/06/gardener.webp",
  },
  {
    id: 48,
    title: "Pre-Inspection Checklist - Property Management",
    description:
      "Confirm tenant access, legal requirements, and maintenance types before property inspections.",
    href: "https://soleapp.com.au/resource/pre-inspection-checklist-property-management/",
    image: "https://soleapp.com.au/wp-content/uploads/2025/06/construction-contractor.webp",
  },
  {
    id: 49,
    title: "Post-Job Checklist - Trades",
    description:
      "Complete all necessary tasks after finishing a trade job to ensure quality, payment, and customer satisfaction.",
    href: "https://soleapp.com.au/resource/post-job-checklist-trades/",
    image: "https://soleapp.com.au/wp-content/uploads/2024/08/retail-shop-1280x854.webp",
  },
];

/** The hero card — the Tax Estimator. */
export const HERO_WIDGET: Widget = ALL_WIDGETS[0];

/** What a business with this industry gets to see, hero excluded. */
export function gridWidgets(industryId: number | null | undefined): Widget[] {
  const fitness = industryId === FITNESS_INDUSTRY_ID;
  return ALL_WIDGETS.filter(
    (w) => w.id !== HERO_WIDGET.id && (fitness || !w.fitnessOnly),
  );
}

export function isExternal(href: string): boolean {
  return /^https?:/.test(href);
}
