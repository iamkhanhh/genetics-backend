<a id="readme-top"></a>

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![project_license][license-shield]][license-url]
[![LinkedIn][linkedin-shield]][linkedin-url]

![a45081_backend](https://socialify.git.ci/iamkhanhh/a45081_backend/image?custom_description=A+Web-Based+Bioinformatics+Tool+for+Genetic+Variant+Annotation+Supporting+Clinical+Applications&description=1&forks=1&issues=1&language=1&name=1&owner=1&pattern=Solid&pulls=1&stargazers=1&theme=Dark)

<br />
<div align="center">
  <a href="https://github.com/iamkhanhh/a45081_backend">
    <img src="https://genetics-s3-prod.s3.ap-southeast-1.amazonaws.com/public/genetics.png" alt="Logo">
  </a>

<h3 align="center">Genetics — Clinical Genomics Backend</h3>

  <p align="center">
    A Web-Based Bioinformatics Tool for Genetic Variant Annotation Supporting Clinical Applications
    <br />
    <a href="https://github.com/iamkhanhh/a45081_backend"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://github.com/iamkhanhh/a45081_backend">View Demo</a>
    &middot;
    <a href="https://github.com/iamkhanhh/a45081_backend/issues/new?labels=bug&template=bug-report---.md">Report Bug</a>
    &middot;
    <a href="https://github.com/iamkhanhh/a45081_backend/issues/new?labels=enhancement&template=feature-request---.md">Request Feature</a>
  </p>
</div>



<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#tech-stack">Tech Stack</a></li>
        <li><a href="#features">Features</a></li>
        <li><a href="#architecture">Architecture</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#environment-variables">Environment Variables</a></li>
    <li><a href="#api-endpoints">API Endpoints</a></li>
    <li><a href="#subscription-plans">Subscription Plans</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>



## About The Project

[![Product Name Screen Shot][product-screenshot]](https://example.com)

A production-grade genomics annotation platform built with NestJS. Researchers, labs, and clinicians can upload FASTQ or VCF files, run full variant calling and Ensembl VEP annotation pipelines, explore annotated variants through a rich filter interface, and generate clinical DOCX reports — all secured behind JWT auth and subscription-based usage limits.

The platform uses **two databases in parallel**: MySQL (TypeORM) for relational data (users, workspaces, samples, subscriptions) and MongoDB (Mongoose) for high-volume variant documents (~150 fields, up to 31,000 docs per WGS analysis). Real-time status updates are delivered via **Socket.IO WebSocket**, and payment events via **Server-Sent Events (SSE)**.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Tech Stack

* [![NestJS][NestJS.com]][NestJS-url]
* [![MySQL][MySQL.com]][MySQL-url]
* [![MongoDB][MongoDB.com]][MongoDB-url]
* [![Docker][Docker.com]][Docker-url]
* [![AWS S3][AWS-S3.com]][AWS-S3-url]
* [![EC2][AWS-EC2.com]][AWS-EC2-url]
* [![VEP][VEP.com]][VEP-url]
* [![BCFtools][BCFtools.com]][BCFtools-url]
* [![JWT][JWT.io]][JWT-url]
* [![Redis][Redis.com]][Redis-url]
* [![OpenAI][OpenAI.com]][OpenAI-url]

| Layer | Technology |
|---|---|
| Framework | NestJS 10.3.10 + TypeScript |
| Relational DB | MySQL 8.0 via TypeORM 0.3.20 (25 migrations) |
| Document DB | MongoDB 4.2 via Mongoose 8.5.1 |
| Cache / Queue | Redis 8 via ioredis 5.10.1 |
| Auth | JWT (`@nestjs/jwt` 10.2.0) + Passport.js |
| File Storage | AWS S3 (multipart, presigned URLs) |
| Bioinformatics | Ensembl VEP v114, BWA-MEM2, GATK HaplotypeCaller |
| AI | OpenAI API (chatbot + report summaries) |
| Payments | PayOS (`@payos/node` 2.0.5) |
| Real-time | Socket.IO (WebSocket) + SSE |
| Email | Nodemailer + Handlebars templates |
| Reports | docxtemplater (DOCX templates) |
| API Docs | Swagger (`@nestjs/swagger` 8.1.0) at `/api` |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Features

- **Dual-pipeline variant analysis**
  - VCF → VEP annotation → MongoDB import
  - FASTQ → BWA-MEM2 alignment → GATK MarkDuplicates → BQSR → HaplotypeCaller → VEP → MongoDB import
- **Rich variant filtering** — filter by chromosome, gene, coding effect (annotation), ClinVar classification, allele fraction, gnomAD frequency, and read depth
- **Pharmacogenomics (PGx)** — dedicated PGx variant queries with drug-gene interaction data
- **Clinical report generation** — select variants, auto-generate DOCX report with OpenAI-written summaries, upload to S3
- **AI chatbot** — OpenAI-powered variant interpretation with per-conversation message history in MongoDB
- **Subscription tiers** — Basic (free), Standard, and Premium plans enforced per-day via `UsageLimitGuard`
- **PayOS payment flow** — create checkout link, SSE stream for real-time payment confirmation, auto-activate subscription
- **Real-time updates** — WebSocket events on analysis/sample status changes; SSE for payment events
- **S3 multipart uploads** — resumable large file uploads with presigned URLs
- **Secure auth** — JWT in HTTP-only cookie (100-day expiry), global `AuthGuard`, `@Public()` opt-out
- **Rate limiting** — global throttle: 100 requests / 60 seconds
- **Redis caching** — pattern-based cache invalidation; variant query results cached 30 min
- **Email notifications** — Nodemailer for account activation, status updates (Handlebars templates)
- **Cross-entity search** — global search across workspaces, samples, and analyses
- **Swagger docs** — auto-generated interactive API documentation at `/api`

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Architecture

```
User uploads VCF/FASTQ
        │
        ▼
Backend creates Analysis record (status = QUEUING / FASTQ_QUEUING)
        │
        ▼ (cron @30s)
vcf-analyzer or fastq-analyzer polls backend for pending analyses
        │
        ▼
Worker processes file, POSTs status updates back to backend
        │
        ▼
Backend emits WebSocket event → Angular frontend updates in real-time
```

**Analysis status flow:**
```
VCF  → QUEUING(0) → ANALYZING(1) → ANALYZED(2) → VEP_ANALYZED(4) → IMPORTING(5) → ANALYZED
FASTQ → FASTQ_QUEUING(6) → FASTQ_ANALYZING(7) → ANALYZED(2) → VEP_ANALYZED(4)
                                      ↓ on error
                               ERROR(3) / FASTQ_ERROR(8)
```

**Module map:**

| Module | Route | Responsibility |
|---|---|---|
| `auth/` | — | JWT strategy, login, registration, email activation |
| `users/` | `/users` | User CRUD, profile, password management |
| `workspaces/` | `/workspaces` | Project containers for analyses |
| `samples/` | `/samples` | Sequencing sample management |
| `uploads/` | `/uploads` | S3 multipart upload orchestration |
| `analysis/` | `/analysis` | Analysis job lifecycle + WebSocket events |
| `variants/` | `/variants` | MongoDB variant queries + PGx |
| `vep/` | `/vep` | Proxy trigger to vcf-analyzer worker |
| `variant-calling/` | `/variant-calling` | Proxy trigger to fastq-analyzer worker |
| `patient-information/` | `/patient-information` | Patient demographics and phenotype |
| `report/` | `/report` | DOCX report generation + S3 upload |
| `chatbot/` | `/chatbot` | OpenAI variant interpretation chat |
| `payments/` | `/payments` | PayOS checkout, subscriptions, SSE |
| `pipelines/` | `/pipelines` | Analysis pipeline version management |
| `search/` | `/search` | Cross-entity global search |
| `account/` | `/account` | Dashboard stats, profile summary |

<p align="right">(<a href="#readme-top">back to top</a>)</p>



## Getting Started

### Prerequisites

- **Node.js** ≥ 20 and npm
  ```sh
  node -v   # should be 20+
  ```
- **Docker** and Docker Compose (for MySQL, MongoDB, Redis)
  ```sh
  docker -v
  ```
- **db-migrate** (SQL migration runner)
  ```sh
  npm install -g db-migrate db-migrate-mysql
  ```
- **Ensembl VEP** (offline annotation) — [installation guide](https://asia.ensembl.org/info/docs/tools/vep/script/vep_download.html)
- **BCFtools / VCFtools / BEDtools** (VCF processing utilities)
  ```sh
  sudo apt update && sudo apt install -y bcftools vcftools bedtools
  ```
- **BWA-MEM2** and **GATK 4** (required only for FASTQ pipeline)

### Installation

1. Clone the repo
   ```sh
   git clone https://github.com/iamkhanhh/a45081_backend.git
   cd a45081_backend
   ```

2. Install dependencies
   ```sh
   npm install
   ```

3. Start infrastructure (MySQL, MongoDB, Redis)
   ```sh
   docker compose up -d
   ```

4. Create your environment file (copy from example and fill in values)
   ```sh
   cp .env.example .env.development
   # then edit .env.development with your values
   ```

5. Configure `database.json` for SQL migrations
   ```json
   {
     "dev": {
       "driver": "mysql",
       "host": "<DB_HOST>",
       "port": "<DB_PORT>",
       "user": "<DB_USERNAME>",
       "password": "<DB_PASSWORD>",
       "database": "<DB_DATABASE>",
       "charset": "utf8",
       "collation": "utf8_unicode_ci"
     }
   }
   ```

6. Run database migrations
   ```sh
   ./node_modules/.bin/db-migrate up
   ```

7. Start the development server
   ```sh
   npm run start:dev
   ```

The server starts on port `3000` by default. Swagger UI is available at `http://localhost:3000/api`.

<p>After a successful start you should see:</p>
<img src="https://genetics-s3-prod.s3.ap-southeast-1.amazonaws.com/public/run_backend_success.jpeg" alt="Server start success">

<p align="right">(<a href="#readme-top">back to top</a>)</p>



## Environment Variables

Config is loaded from `.env.${NODE_ENV}` — e.g. `.env.development` or `.env.production`. See `.env.example` for the full template.

| Category | Variable(s) |
|---|---|
| App | `PORT`, `ALLOWED_ORIGINS`, `VCF_IOBIO_HOST`, `IGV_HOST` |
| MySQL | `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` |
| MongoDB | `MONGO_DB_HOST`, `MONGO_DB_PORT`, `MONGO_DB_DATABASE`, `MONGO_DB_PREFIX`, `MONGO_CHAT_COLLECTION`, `MONGO_IMPORT_CMD` |
| Redis | `REDIS_HOST`, `REDIS_PORT` |
| JWT | `JWT_SECRET`, `JWT_ACCESS_TOKEN_EXPIRED` (e.g. `"100d"`) |
| Email | `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_HOST` |
| AWS S3 | `AWS_ACCESS_KEY`, `AWS_SECRET_KEY`, `AWS_BUCKET`, `AWS_REGION` |
| Storage paths | `MOUNT_FOLDER`, `EXPORT_FOLDER`, `ANALYSIS_FOLDER`, `UPLOAD_FOLDER`, `FASTA_FOLDER` |
| External APIs | `VEP_TOKEN`, `FASTQ_TOKEN`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `GENEBE_USERNAME`, `GENEBE_API_KEY` |
| Payments | `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` |

> **Never commit `.env.*` files.** They are git-ignored by default.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



## API Endpoints

All routes require JWT authentication (cookie-based) unless marked `@Public()`. Swagger UI at `/api` lists every endpoint with request/response schemas.

| Prefix | Description |
|---|---|
| `POST /auth/login` | Login, set HTTP-only JWT cookie |
| `POST /auth/register` | Register + send activation email |
| `GET /users` | User management |
| `GET /workspaces` | Workspace CRUD |
| `GET /samples` | Sample management |
| `POST /uploads` | Initiate S3 multipart upload |
| `GET /analysis` | Analysis job management |
| `GET /variants` | Variant queries with filtering |
| `GET /variants/pgx` | Pharmacogenomics variants |
| `POST /vep` | Trigger VEP annotation |
| `POST /variant-calling` | Trigger FASTQ pipeline |
| `GET /patient-information` | Patient records |
| `POST /report` | Generate clinical report |
| `POST /chatbot` | AI variant interpretation |
| `POST /payments` | Create PayOS checkout |
| `GET /payments/sse` | SSE stream for payment status |
| `GET /pipelines` | Pipeline versions |
| `GET /search` | Cross-entity search |
| `GET /account` | User dashboard stats |

<p align="right">(<a href="#readme-top">back to top</a>)</p>



## Subscription Plans

Usage limits are enforced per-day via `UsageLimitGuard`. Plans are stored in MySQL (`SubscriptionPlan` entity).

| Plan | Price | Daily Uploads | Daily Analyses | QC | Reports |
|---|---|---|---|---|---|
| **Basic** | Free | 3 | 3 | No | No |
| **Standard** | Paid | 10 | 10 | Yes | Yes |
| **Premium** | Paid | Unlimited | Unlimited | Yes | Yes |

Payment flow: create checkout link via PayOS → wait on SSE stream → webhook confirms payment → `UserSubscription` activated automatically.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



## Roadmap

- [x] Sign In / Sign Up with email activation
- [x] JWT authentication (HTTP-only cookie)
- [x] Workspace, Sample, and Analysis management
- [x] VCF upload and VEP annotation pipeline
- [x] FASTQ upload and full variant calling pipeline (BWA-MEM2 + GATK)
- [x] Rich variant filtering (gene, chromosome, effect, ClinVar, gnomAD, AF, depth)
- [x] Pharmacogenomics (PGx) variant queries
- [x] Clinical DOCX report generation with OpenAI summaries
- [x] AI chatbot for variant interpretation (OpenAI)
- [x] Subscription plans (Basic / Standard / Premium) with daily limits
- [x] PayOS payment integration with SSE status stream
- [x] Real-time WebSocket updates for analysis/sample status
- [x] Redis caching with pattern-based invalidation
- [x] S3 multipart file uploads with presigned URLs
- [x] Global search across workspaces, samples, analyses
- [x] Patient information management
- [x] Swagger API documentation
- [ ] IGV.js integration for in-browser variant visualization
- [ ] Cohort-level variant aggregation and statistics
- [ ] Variant tagging and custom annotation presets

See the [open issues](https://github.com/iamkhanhh/a45081_backend/issues) for a full list of proposed features and known bugs.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Top contributors:

<a href="https://github.com/iamkhanhh/a45081_backend/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=iamkhanhh/a45081_backend" alt="contrib.rocks image" />
</a>

## Contact

Nguyen Quoc Khanh — khanh9102004@gmail.com

Project Link: [https://github.com/iamkhanhh/a45081_backend](https://github.com/iamkhanhh/a45081_backend)

<p align="right">(<a href="#readme-top">back to top</a>)</p>



## Acknowledgments

* [Ensembl VEP](https://asia.ensembl.org/info/docs/tools/vep/index.html)
* [NestJS](https://docs.nestjs.com/)
* [BCFtools](https://samtools.github.io/bcftools/bcftools.html)
* [BWA-MEM2](https://github.com/bwa-mem2/bwa-mem2)
* [GATK](https://gatk.broadinstitute.org/)
* [PayOS](https://payos.vn/)
* [OpenAI API](https://platform.openai.com/docs/)
* [Angular](https://v17.angular.io/docs)

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- MARKDOWN LINKS & IMAGES -->
[contributors-shield]: https://img.shields.io/github/contributors/iamkhanhh/a45081_backend.svg?style=for-the-badge
[contributors-url]: https://github.com/iamkhanhh/a45081_backend/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/iamkhanhh/a45081_backend.svg?style=for-the-badge
[forks-url]: https://github.com/iamkhanhh/a45081_backend/network/members
[stars-shield]: https://img.shields.io/github/stars/iamkhanhh/a45081_backend.svg?style=for-the-badge
[stars-url]: https://github.com/iamkhanhh/a45081_backend/stargazers
[issues-shield]: https://img.shields.io/github/issues/iamkhanhh/a45081_backend.svg?style=for-the-badge
[issues-url]: https://github.com/iamkhanhh/a45081_backend/issues
[license-shield]: https://img.shields.io/github/license/iamkhanhh/a45081_backend.svg?style=for-the-badge
[license-url]: https://github.com/iamkhanhh/a45081_backend/blob/master/LICENSE.txt
[linkedin-shield]: https://img.shields.io/badge/-LinkedIn-black.svg?style=for-the-badge&logo=linkedin&colorB=555
[linkedin-url]: https://linkedin.com/in/iamkhanh
[product-screenshot]: https://genetics-s3-prod.s3.ap-southeast-1.amazonaws.com/public/genetic_screenshot.jpeg

[NestJS.com]: https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white
[NestJS-url]: https://nestjs.com/

[MySQL.com]: https://img.shields.io/badge/MySQL-4479A1?style=for-the-badge&logo=mysql&logoColor=white
[MySQL-url]: https://www.mysql.com/

[MongoDB.com]: https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white
[MongoDB-url]: https://www.mongodb.com/

[Docker.com]: https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white
[Docker-url]: https://www.docker.com/

[AWS-S3.com]: https://img.shields.io/badge/AWS%20S3-569A31?style=for-the-badge&logo=amazon-aws&logoColor=white
[AWS-S3-url]: https://aws.amazon.com/s3/

[AWS-EC2.com]: https://img.shields.io/badge/AWS%20EC2-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white
[AWS-EC2-url]: https://aws.amazon.com/ec2/

[VEP.com]: https://img.shields.io/badge/VEP-000000?style=for-the-badge&logo=databricks&logoColor=white
[VEP-url]: https://www.ensembl.org/info/docs/tools/vep/index.html

[BCFtools.com]: https://img.shields.io/badge/BCFtools-3776AB?style=for-the-badge&logo=gnu-bash&logoColor=white
[BCFtools-url]: http://samtools.github.io/bcftools/

[JWT.io]: https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white
[JWT-url]: https://jwt.io/

[Redis.com]: https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white
[Redis-url]: https://redis.io/

[OpenAI.com]: https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white
[OpenAI-url]: https://platform.openai.com/
