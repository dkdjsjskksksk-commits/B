# 우리 반 수행평가 게시판

과목, 설명, 평가 날짜, 준비물, 학급을 게시하는 모바일 대응 학급 게시판입니다. 게시물은 기본적으로 누구나 읽을 수 있고, Supabase Auth로 로그인한 뒤 `class_admins`에 등록된 계정만 추가·수정·삭제할 수 있습니다. 관리자 변경 사항은 Supabase Realtime 구독을 통해 열린 학생 화면에 반영됩니다.

## Supabase 연결

1. Supabase 프로젝트를 만든 뒤 SQL Editor에서 `supabase-setup.sql` 전체를 실행합니다.
2. Authentication의 Users에서 관리자 계정을 생성합니다. 공개 회원가입은 사용하지 않아도 됩니다.
3. SQL Editor에서 아래 쿼리의 이메일을 실제 관리자 이메일로 바꾸어 실행해 관리자 권한을 부여합니다.

   ```sql
   insert into public.class_admins (user_id)
   select id from auth.users where email = 'admin@example.com'
   on conflict (user_id) do nothing;
   ```

4. Project Settings → API에서 Project URL과 anon/public key를 복사해 `config.js`의 빈 값에 입력합니다.
5. 정적 웹 호스팅에 저장소 파일을 배포합니다. 로컬에서 확인하려면 저장소 폴더에서 `python -m http.server 8000`을 실행한 뒤 `http://localhost:8000`을 엽니다.

`config.js`에는 브라우저에서 써도 되는 anon/public key만 입력합니다. `service_role` key는 RLS를 우회하므로 HTML, JavaScript, 저장소 또는 브라우저에 넣지 마세요. 게시판은 읽기 전용 학생에게 로그인 없이 공개되며, 쓰기 권한은 DB의 RLS 정책에서 검사합니다. 학급 전용 열람이 필요하면 별도 학생 인증과 읽기 정책을 추가해야 합니다.

## 연결 전 미리보기

Supabase 설정이 비어 있으면 빈 게시판으로 실행됩니다. 관리자 로그인 창에서 **관리자 화면 보기**를 선택하면 CRUD 화면을 확인할 수 있습니다. 미리보기 일정은 현재 브라우저의 `localStorage`에만 저장되므로 다른 기기와 공유되지 않으며 실제 인증도 아닙니다.
