// src/components/FeatureWindow/panels/mypage/FeatureMypage.jsx
import React, { useState } from "react";
import ChangePassword from "./ChangePassword";

/**
 * 공용 행 컴포넌트
 * - value: 문자열 또는 JSX 노드
 * - actionLabel / onAction / actionDisabled: 기본(우측) 버튼
 * - secondaryActionLabel / onSecondaryAction / secondaryDisabled: 보조 버튼(우측에 나란히)
 * - 버튼이 하나도 없으면 우측 폭만 맞추는 placeholder를 둬 정렬 유지
 */
function Row({
  label,
  value,
  actionLabel,
  onAction,
  actionDisabled = false,
  secondaryActionLabel,
  onSecondaryAction,
  secondaryDisabled = false,
}) {
  const hasAnyAction = Boolean(actionLabel || secondaryActionLabel);

  return (
    <div className="flex items-center justify-between py-6 border-b bg-transparent border-zinc-300">
      <div className="flex flex-col w-full mr-6">
        <span className="text-base font-medium text-zinc-400">{label}</span>
        <div className="text-base text-black">{value}</div>
      </div>

      {hasAnyAction ? (
        <div className="flex items-center justify-end gap-2 w-[296px]">
          {secondaryActionLabel && (
            <button
              type="button"
              onClick={onSecondaryAction}
              disabled={secondaryDisabled}
              className="h-12 min-w-[120px] rounded-lg border-2 border-neutral-200 text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {secondaryActionLabel}
            </button>
          )}
          {actionLabel && (
            <button
              type="button"
              onClick={onAction}
              disabled={actionDisabled}
              className="h-12 min-w-[120px] rounded-lg border-2 border-neutral-200 text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLabel}
            </button>
          )}
        </div>
      ) : (
        // 버튼 없는 행에서도 우측 폭/정렬 유지
        <div className="h-12 w-[296px]" />
      )}
    </div>
  );
}

export function FeatureMypage({ onChangePage }) {
  // (수정필요) 임시 사원 데이터 - 실제 사용자 데이터 연동
  const emp = {
    name: "홍길동",
    dept: "인사부",
    rank: "팀장",
    email: "hgd1234@clicka.co.kr",
    accountId: "230519875",
  };

  // 비밀번호는 항상 마스킹 10개 점
  const maskedPassword = "•".repeat(10);

  // 이메일 마스킹 - 앞 두자 제외 마스킹 처리. ex) "hg •••••• @ clicka.co.kr"
  const maskEmail = (email) => {
    if (!email) return "";
    const [local, domain] = email.split("@");
    if (!domain) return email;
    const visible = local.slice(0, 2) || local;
    const dots = "•".repeat(Math.max(local.length - 2, 6));
    return `${visible} ${dots} @ ${domain}`;
  };

  // --- 인라인 이메일 편집 상태 ---
  const [currentEmail, setCurrentEmail] = useState(emp.email); // 실제 표시/저장 값
  const [isEmailEditing, setIsEmailEditing] = useState(false); // 편집 모드 여부
  const [emailInput, setEmailInput] = useState(emp.email);     // 입력창 값

  // 간단한 이메일 형식 검증
  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  const isEmailValid = emailRegex.test(emailInput);
  const isEmailChanged = emailInput !== currentEmail;

  // 편집 중일 때만, 형식 OK + 값 변경 시에만 "변경하기" 활성화
  const canApplyEmail = isEmailEditing && isEmailValid && isEmailChanged;

  // 값 영역: 편집 중이면 input, 아니면 마스킹된 텍스트
  const emailValueNode = isEmailEditing ? (
    <div className="w-full max-w-[520px]">
      <input
        type="email"
        value={emailInput}
        onChange={(e) => setEmailInput(e.target.value)}
        placeholder="example@clicka.co.kr"
        className={`h-12 w-full rounded-lg border px-4 text-base outline-none ${
          emailInput.length > 0 && !isEmailValid
            ? "border-red-400 focus:border-red-500"
            : "border-zinc-300 focus:border-zinc-400"
        }`}
      />
      {emailInput.length > 0 && !isEmailValid && (
        <p className="mt-1 text-xs text-red-500">올바른 이메일 형식이 아닙니다.</p>
      )}
    </div>
  ) : (
    maskEmail(currentEmail)
  );

  // 버튼 클릭 핸들러: 편집 진입 / 변경 적용
  const handleEmailApply = () => {
    if (!isEmailEditing) {
      // 편집 모드로 전환
      setIsEmailEditing(true);
      setEmailInput(currentEmail);
      return;
    }
    // 편집 중: 변경 적용
    if (!canApplyEmail) return;

    // TODO: 실제 API 연동 위치 (변경 요청)
    console.log("[이메일 변경 요청]", { newEmail: emailInput });

    // 성공 가정: 로컬 반영 후 편집 종료
    setCurrentEmail(emailInput);
    setIsEmailEditing(false);
  };

  // 이메일 변경 - 취소(버튼): 입력값 원복 + 편집 종료
  const handleEmailCancel = () => {
    setEmailInput(currentEmail);
    setIsEmailEditing(false);
  };

  return (
    <section>
      <div className="mx-auto w-full max-w-[1200px] px-6 py-6">
        {/* 페이지 제목 */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">마이페이지</h1>
        </div>

        {/* 컨텐츠 */}
        <div className="mt-6 max-w-[937px]">
          {/* 사원 정보 */}
          <h2 className="text-lg font-semibold text-black mb-4">사원 정보</h2>
          <Row label="이름" value={emp.name} />
          <Row label="부서" value={emp.dept} />
          <Row label="직급" value={emp.rank} />

          {/* 계정 */}
          <h2 className="text-lg font-semibold text-black mt-10 mb-4">계정</h2>
          <Row label="아이디" value={emp.accountId} />
          <Row
            label="비밀번호"
            value={maskedPassword}
            actionLabel="비밀번호 변경"
            onAction={() => onChangePage("changepassword")}
          />
          <Row
            label="이메일"
            value={emailValueNode}
            // 편집 전: [이메일 변경]
            // 편집 중: [취소하기] [변경하기]
            actionLabel={isEmailEditing ? "변경하기" : "이메일 변경"}
            onAction={handleEmailApply}
            actionDisabled={isEmailEditing && !canApplyEmail}
            secondaryActionLabel={isEmailEditing ? "취소" : undefined}
            onSecondaryAction={isEmailEditing ? handleEmailCancel : undefined}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * 상위 컨테이너
 * - 여기서만 page 상태를 관리, 하위 패널을 조건부 렌더링
 * - 이메일 변경은 인라인 편집으로 처리
 */
export default function MypageContainer() {
  const [page, setPage] = useState("mypage");

  return (
    <>
      {page === "mypage" && <FeatureMypage onChangePage={setPage} />}
      {page === "changepassword" && <ChangePassword onChangePage={setPage} />}
    </>
  );
}
