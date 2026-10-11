/** Skill dictionary used to read both CVs and job ads: "Canonical|Category|alias1,alias2" */
const RAW = `
JavaScript|Languages|js,ecmascript,es6
TypeScript|Languages|
Python|Languages|
Java|Languages|
C#|Languages|csharp
C++|Languages|cpp
PHP|Languages|
Ruby|Languages|
Go|Languages|golang
Rust|Languages|
Kotlin|Languages|
Swift|Languages|
Dart|Languages|
SQL|Languages|
HTML|Frontend|html5
CSS|Frontend|css3
Sass|Frontend|scss
Tailwind CSS|Frontend|tailwind
Bootstrap|Frontend|
React|Frontend|react.js,reactjs
Next.js|Frontend|nextjs
Vue|Frontend|vue.js,vuejs,vue 3
Nuxt|Frontend|nuxt.js,nuxtjs
Angular|Frontend|angularjs
Svelte|Frontend|
Redux|Frontend|
Pinia|Frontend|
Vite|Frontend|
Webpack|Frontend|
jQuery|Frontend|
Node.js|Backend|nodejs
Express.js|Backend|expressjs
NestJS|Backend|nest.js
Django|Backend|
Flask|Backend|
FastAPI|Backend|
Spring Boot|Backend|
Laravel|Backend|
.NET|Backend|dotnet,asp.net,.net core
GraphQL|Backend|
REST API|Backend|restful,rest apis
gRPC|Backend|
Microservices|Backend|microservice
WebSocket|Backend|websockets,socket.io
PostgreSQL|Database|postgres
MySQL|Database|
MariaDB|Database|
MongoDB|Database|mongo
SQLite|Database|
Redis|Database|
Firebase|Database|
Supabase|Database|
Prisma|Database|
TypeORM|Database|
Elasticsearch|Database|
Oracle|Database|
Docker|DevOps|
Kubernetes|DevOps|k8s
AWS|Cloud|amazon web services
Azure|Cloud|
Google Cloud|Cloud|gcp
Vercel|Cloud|
Heroku|Cloud|
Linux|DevOps|
Git|DevOps|
GitHub|DevOps|
GitLab|DevOps|
CI/CD|DevOps|cicd,jenkins,github actions
Terraform|DevOps|
Nginx|DevOps|
Agile|Practices|scrum,kanban
Jira|Practices|
Unit Testing|Practices|jest,mocha,junit,pytest,cypress,selenium
Test Automation|Practices|qa automation
Figma|Design|
UI/UX|Design|ux,ui design,user experience
Photoshop|Design|
React Native|Mobile|
Flutter|Mobile|
Android|Mobile|
iOS|Mobile|
Ionic|Mobile|
PWA|Mobile|progressive web app
Machine Learning|Data & AI|ml
Deep Learning|Data & AI|
TensorFlow|Data & AI|
PyTorch|Data & AI|
scikit-learn|Data & AI|sklearn
NLP|Data & AI|natural language processing
Computer Vision|Data & AI|opencv
Generative AI|Data & AI|llm,llms,openai
Pandas|Data & AI|
NumPy|Data & AI|
Data Analysis|Data & AI|data analytics
Data Visualization|Data & AI|
Power BI|Data & AI|powerbi
Tableau|Data & AI|
Microsoft Excel|Data & AI|ms excel
ETL|Data & AI|
Apache Spark|Data & AI|spark,pyspark
Hadoop|Data & AI|
IoT|Systems|internet of things,mqtt
Arduino|Systems|
Raspberry Pi|Systems|
Embedded Systems|Systems|
Networking|Systems|tcp/ip
Cybersecurity|Security|information security,infosec
Penetration Testing|Security|pentest
OAuth|Security|jwt,oauth2
Blockchain|Other|solidity,web3
SAP|Business|
Salesforce|Business|
ERP|Business|
Project Management|Business|
Business Analysis|Business|
Technical Writing|Business|
Communication|Soft Skills|
Teamwork|Soft Skills|
Problem Solving|Soft Skills|
Leadership|Soft Skills|
`;

export interface SkillDef {
  name: string;
  category: string;
  terms: string[];
}

export const SKILLS: SkillDef[] = RAW.trim()
  .split('\n')
  .map((line) => {
    const [name, category, aliases] = line.split('|');
    return {
      name,
      category,
      terms: [name, ...(aliases ? aliases.split(',') : [])]
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t && t !== 'go'),
    };
  });

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');

const MATCHERS = SKILLS.map((s) => ({
  def: s,
  re: new RegExp(`(^|[^a-z0-9+#.])(?:${s.terms.map(escapeRe).join('|')})(?=$|[^a-z0-9+#]|\\.(?:\\s|$))`, 'i'),
}));

/** Canonical skill names found in free text */
export function findSkills(text: string): string[] {
  const t = ` ${text || ''} `;
  const out: string[] = [];
  for (const m of MATCHERS) if (m.re.test(t)) out.push(m.def.name);
  return out;
}

export function categoryOf(name: string): string {
  return SKILLS.find((s) => s.name.toLowerCase() === name.toLowerCase())?.category || 'General';
}

/** Map any user-entered skill label to its canonical dictionary name (or itself) */
export function canonicalize(label: string): string[] {
  const found = findSkills(label);
  return found.length ? found : [label.trim()];
}
