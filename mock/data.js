/*
 * Profile data — sourced ONLY from Hugo's LinkedIn export (~/Downloads/Profile.pdf).
 * Anything not in that export is explicitly marked as a placeholder.
 * Single source of truth for the resume, the chat assistant and the page copy.
 */
const PROFILE = {
  name: "Hugo Lafleur",
  headline: "Engineering Leader",
  currentRole: "Director, AI Engineering Management",
  currentCompany: "ServiceNow",
  location: "Montreal, Quebec, Canada",
  email: "hugo.lafleur@gmail.com",
  links: {
    linkedin: "https://www.linkedin.com/in/hugolafleur",
    github: "https://github.com/HugoLafleur/",
    flickr: "https://flickr.com/photos/hugohugohugo",
  },

  // Close paraphrase of the LinkedIn "Summary" section.
  resumeSummary:
    "Technology practitioner in software development, AI, DevOps and SRE with ~8 years in management positions. " +
    "Remaining hands-on keeps him connected to execution teams and their complex challenges; pairing that understanding " +
    "with storytelling and insightful data, he surfaces critical issues to upper leadership — leading to better-informed " +
    "decisions that improved deployment success rate and team engagement.",

  topSkills: ["Splunk Enterprise", "Business Storytelling", "Organizational Leadership"],

  // Feature Flags
  features: {
    // Default enabled. Can be overridden via URL (?llm=0) or localStorage.setItem('feature:llm', 'false')
    llm: true,
    llmProvider: "cohere",
    llmModel: "command-r7b-12-2024",
    llmEndpoint: "/api/chat",
  },

  // Technologies explicitly named in the experience section of the profile.
  tech: [
    "Kubernetes", "Azure", "AWS (EKS, Lambda, API Gateway, S3, RDS)", "Python", "Docker", "Mesos", "Chef",
    "Prometheus", "Grafana", "Dynatrace", "Sumo Logic", "Jenkins", "Ant", "Java · Tomcat · WebSphere",
    "Oracle", "MySQL", "C#.NET · MSSQL",
  ],

  languages: [
    { name: "French", level: "Native / bilingual" },
    { name: "English", level: "Native / bilingual" },
  ],

  certifications: ["Unconscious Bias"],

  education: {
    school: "Université de Sherbrooke",
    degree: "B.Eng., Electrical Engineering (Génie électrique)",
    years: "2000 — 2004",
  },

  offHours: [
    "Biking to the climbing gym",
    "Playing board games with his kids",
    "Woodworking in the workshop",
  ],

  experience: [
    {
      company: "ServiceNow",
      location: "Montreal, QC",
      roles: [
        { title: "Director, AI Engineering Management", dates: "Mar 2026 — Present", todo: true },
        { title: "Sr. Manager, Machine Learning Infrastructure", dates: "Sep 2023 — Mar 2026", todo: true },
      ],
    },
    {
      company: "EXFO",
      location: "Quebec, Canada",
      roles: [{ title: "Software Development Manager", dates: "Jan 2023 — Sep 2023", todo: true }],
    },
    {
      company: "ServiceNow",
      location: "Montreal, QC",
      roles: [
        {
          title: "Technical Manager, Infrastructure & SRE",
          dates: "Jan 2021 — Jan 2023",
          bullets: ["Technical leadership of SRE/DevOps; SaaS hosting of AI workloads on a Kubernetes/Azure platform."],
        },
      ],
    },
    {
      company: "Element AI",
      note: "acquired by ServiceNow",
      location: "Montreal, QC",
      roles: [{ title: "Technical Manager", dates: "Mar 2020 — Dec 2020" }],
    },
    {
      company: "Octave Group",
      location: "Montreal, QC",
      roles: [
        {
          title: "Director, SRE",
          dates: "Feb 2019 — Mar 2020",
          bullets: [
            "Owned the global technology budget and AWS spend management.",
            "Led and grew the SRE team — SysAdmins, DBAs and DevOps.",
          ],
        },
        {
          title: "Team Lead, SRE",
          dates: "Dec 2016 — Feb 2019",
          bullets: [
            "Managed the operations team and production delivery of applications and service platforms.",
            "Led the observability project (Prometheus, Grafana, Dynatrace, Sumo Logic) and a POC for production workloads on Kubernetes (AWS EKS).",
            "Built a CMDB recording production deployments (Python, API Gateway, Lambda, RDS-MySQL); implemented a deployment quality improvement process.",
          ],
        },
        {
          title: "Linux Automation Specialist",
          dates: "Feb 2016 — Dec 2016",
          bullets: ["Deployment automation (Python, AWS, Docker, Mesos) and observability (Prometheus, Grafana)."],
        },
      ],
    },
    {
      company: "Ubisoft",
      location: "Montreal, QC",
      roles: [
        {
          title: "DevOps Specialist",
          dates: "Sep 2015 — Feb 2016",
          bullets: ["Automated cloud provisioning and deployment pipelines (Python, Chef, AWS); release manifest publication process (S3, Lambda)."],
        },
      ],
    },
    {
      company: "Dassault Systèmes",
      location: "Montreal · Ohio · Washington",
      roles: [
        {
          title: "Consultant, Infrastructure & Deployment",
          dates: "Apr 2007 — Nov 2015",
          bullets: [
            "<b>Honda R&amp;D Americas</b> (2012–2015): ENOVIA V6 deployments and operations, Ant/Jenkins automation, defect RCA, incident response.",
            "<b>Boeing</b> (2007–2010): observability, performance analysis, capacity planning, automated performance testing.",
            "Managed a QA team of 8; ran spec review workshops between QA and Dev, test strategy and effort planning.",
          ],
        },
      ],
    },
    {
      company: "Earlier",
      location: "Montreal, QC",
      roles: [
        { title: "Solutions Analyst · KPMG", dates: "2005 — 2006" },
        { title: "Technical Support Agent · Teleperformance", dates: "2004 — 2005" },
      ],
    },
  ],

  // PLACEHOLDER — blog topic ideas derived from the profile, no real posts yet.
  posts: [
    {
      title: "Staying hands-on as an engineering leader",
      tag: "Leadership", read: "6 min",
      excerpt: "Why keeping a connection with execution teams makes you a better advocate for them.",
      outline: [
        "The trap of drifting away from the work once you manage managers.",
        "What 'hands-on' realistically means at director level.",
        "How it changes the quality of the conversations you have with leadership.",
      ],
    },
    {
      title: "Telling the story behind the data",
      tag: "Leadership", read: "8 min",
      excerpt: "Using storytelling and data to surface critical issues to upper leadership.",
      outline: [
        "Why raw metrics rarely move decisions.",
        "Framing a deployment-reliability problem as a business story.",
        "What changed afterwards: deployment success rate and team engagement.",
      ],
    },
    {
      title: "Hosting AI workloads on Kubernetes: notes from the platform side",
      tag: "Infrastructure", read: "10 min",
      excerpt: "From Element AI to ServiceNow — what running AI in production taught an SRE team.",
      outline: [
        "Context: SaaS hosting of AI workloads on Kubernetes/Azure.",
        "Where classic SRE practices held up, and where they didn't.",
        "Lessons for teams starting out.",
      ],
    },
    {
      title: "Observability, from Boeing to EKS",
      tag: "SRE", read: "7 min",
      excerpt: "Fifteen years of performance dashboards, capacity planning and Prometheus.",
      outline: [
        "Automated performance dashboards before 'observability' was a word.",
        "Rolling out Prometheus, Grafana, Dynatrace and Sumo Logic at Octave Group.",
        "What he would do the same — and differently — today.",
      ],
    },
    {
      title: "What the wood shop teaches about building systems",
      tag: "Craft", read: "5 min",
      excerpt: "Measure twice, cut once — and other habits that transfer to engineering.",
      outline: [
        "Tolerances, grain and why materials push back.",
        "Patience as an engineering skill.",
        "Making things with your hands as a counterweight to managing.",
      ],
    },
  ],

  // PLACEHOLDER — the LinkedIn PDF export does not include recommendations.
  references: [
    { prompt: "A recommendation from a former manager — e.g. from your Octave Group or ServiceNow years.", who: "Name", role: "Title · Company" },
    { prompt: "A peer or cross-functional partner on how you communicate critical issues to leadership.", who: "Name", role: "Title · Company" },
    { prompt: "Someone who reported to you — on what it's like to be on your team.", who: "Name", role: "Title · Company" },
  ],
};

if (typeof window !== "undefined") window.PROFILE = PROFILE;
if (typeof module === "object" && module.exports) module.exports = PROFILE;
