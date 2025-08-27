New Node.js API Server (실종신고 앱에서 사용할 서버)
이 서버는 AWS EC2에 배포되었으며, Nginx를 리버스 프록시로 사용하여 외부의 HTTPS 요청을 안전하게 내부 Node.js 애플리케이션으로 전달합니다. 데이터베이스는 AWS RDS(MySQL)를 사용하며, PM2를 통해 서버 프로세스를 안정적으로 관리합니다.

주요 기능
사용자 관리: 회원가입, 프로필 조회 및 수정, 계정 비활성화 (소프트 삭제)
실종자 신고: 실종자 정보 등록, 목록 조회, 상세 조회, 정보 수정 및 삭제
실종 동물 신고: 실종 동물 정보 등록, 목록 조회, 상세 조회, 정보 수정 및 삭제
목격담 관리: 특정 실종자/실종 동물에 대한 목격담 등록 및 조회
지도 기능: 모든 실종자 및 실종 동물의 목격 위치 정보 조회
개인 게시물 조회: 로그인한 사용자가 등록한 모든 실종 신고 게시물 조회
인증 미들웨어: Firebase ID Token을 활용한 사용자 인증 및 권한 확인

사용 기술 스택
Node.js
Express.js: 웹 애플리케이션 프레임워크
MySQL2: MySQL 데이터베이스 드라이버 (Promise 기반)
Firebase Admin SDK: 사용자 인증 및 Firebase 서비스 연동
dotenv: 환경 변수 관리
cors: 교차 출처 리소스 공유(CORS) 관리
nginx : 리버스 프록시 및 SSL/TLS 종료
Certbot : Let's Encrypt를 이용한 SSL 인증서 자동 발급 및 갱신
PM2 : Node.js 애플리케이션 프로세스 매니저 

프로젝트 설정 및 실행 방법
1. 프로젝트 클론 (Clone)
git clone [프로젝트_레포지토리_URL]
cd new-node-app

3. 의존성 설치
프로젝트 루트 디렉토리에서 다음 명령어를 실행하여 필요한 Node.js 패키지들을 설치합니다.
npm install

5. 환경 변수 설정 (.env)
프로젝트 루트 디렉토리에 .env 파일을 생성하고 다음 환경 변수들을 설정합니다.
.gitignore 파일에 serviceAccountKey.json 및 .env 파일이 포함되어 있으므로, 민감한 정보는 Git에 올라가지 않도록 관리됩니다.

6. Firebase Service Account Key 설정
Firebase 프로젝트에서 서비스 계정 키 파일을 다운로드하여 프로젝트 루트 디렉토리에 serviceAccountKey.json 이름으로 저장합니다. 이 파일은 Firebase Admin SDK 초기화에 사용됩니다.

7. 데이터베이스 설정
MySQL 데이터베이스에 다음 테이블들을 생성해야 합니다.
필요한 테이블 스키마는 프로젝트 루트의 schema.sql 파일에 정의되어 있습니다.

9. 서버 실행
개발 환경 : node index.js
운영 환경 : pm2 start index.js


아래는 주요 API 엔드포인트 목록입니다. (자세한 요청 및 응답 형식은 index.js 파일을 참조하세요.)

사용자 API (/api/auth, /api/users)
POST /api/auth/register: 새로운 사용자 등록
GET /api/users/me: 현재 인증된 사용자 프로필 조회 (인증 필요)
PATCH /api/users/me: 현재 인증된 사용자 프로필 업데이트 (인증 필요)
DELETE /api/users/me: 현재 인증된 사용자 계정 비활성화 (인증 필요)

실종자 API (/api/missing-persons)
POST /api/missing-persons: 실종자 신고 등록 (인증 필요)
GET /api/missing-persons: 실종자 목록 조회
GET /api/missing-persons/:id: 특정 실종자 상세 정보 조회
PATCH /api/missing-persons/:id: 특정 실종자 정보 수정 (인증 및 소유권 확인 필요)
DELETE /api/missing-persons/:id: 특정 실종자 정보 삭제 (인증 및 소유권 확인 필요)

실종 동물 API (/api/missing-animals)
POST /api/missing-animals: 실종 동물 신고 등록 (인증 필요)
GET /api/missing-animals: 실종 동물 목록 조회
GET /api/missing-animals/:id: 특정 실종 동물 상세 정보 조회
PATCH /api/missing-animals/:id: 특정 실종 동물 정보 수정 (인증 및 소유권 확인 필요)
DELETE /api/missing-animals/:id: 특정 실종 동물 정보 삭제 (인증 및 소유권 확인 필요)

목격담 API (/api/missing-persons/:id/sightings, /api/missing-animals/:id/sightings)
POST /api/missing-persons/:missing_person_id/sightings: 특정 실종자에 대한 목격담 등록 (인증 필요)
GET /api/missing-persons/:missing_person_id/sightings: 특정 실종자의 목격담 목록 조회
POST /api/missing-animals/:missing_animal_id/sightings: 특정 실종 동물에 대한 목격담 등록 (인증 필요)
GET /api/missing-animals/:missing_animal_id/sightings: 특정 실종 동물의 목격담 목록 조회

지도 및 개인 게시물 API
GET /api/sightings/all: 모든 실종자 및 실종 동물의 목격 위치 정보 조회
GET /api/users/me/posts: 현재 인증된 사용자가 작성한 모든 실종 신고 게시물 조회 (인증 필요)
