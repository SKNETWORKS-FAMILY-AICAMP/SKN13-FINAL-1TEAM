import React, { useState } from "react";

// 아이콘
import { LuEye, LuEyeClosed } from "react-icons/lu";

// ---------------------------------------------------------------------
// 상수 / 검증
// ---------------------------------------------------------------------
const ACTUAL_CURRENT_PASSWORD = "1234"; // 데모용 (실서비스는 서버 검증으로 교체)
const policyRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[.!@#$%])[A-Za-z\d.!@#$%]{8,20}$/;

/** 제출 시 한 번에 검증 → 에러 객체 반환 */
function validateOnSubmit({ curr, next, confirm }) {
  return {
    currError: curr !== ACTUAL_CURRENT_PASSWORD,
    nextPolicyError: !policyRegex.test(next),
    sameAsCurrError: next === curr,
    confirmError: next !== confirm,
  };
}

// ---------------------------------------------------------------------
// 공용 패스워드 입력 (아이콘 토글/보더/문구 포함)
// ---------------------------------------------------------------------
function PasswordTextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  error = false,
  errorText,       // 빨간 안내문구 (있으면 우선 표시)
  hint,            // 보조 안내문구 (정책 안내 등)
  hintClassName,   // 힌트 색상/사이즈 조절
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="flex flex-col">
      <label
        htmlFor={id}
        className={`mb-2 text-sm ${error ? "text-[#CD2317]" : "text-neutral-600"}`}
      >
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={error || undefined}
          aria-describedby={errorText ? `${id}-error` : undefined}
          className={`h-12 w-full rounded-lg border bg-white px-4 pr-12 text-base outline-none ${
            error ? "border-[#CD2317] focus:border-[#CD2317]" : "border-zinc-300 focus:border-zinc-400"
          }`}
        />
        <button
          type="button"
          aria-label={show ? "비밀번호 숨기기" : "비밀번호 표시"}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-zinc-100"
          onClick={() => setShow((v) => !v)}
        >
          {show ? <LuEye className="w-5 h-5" /> : <LuEyeClosed className="w-5 h-5" />}
        </button>
      </div>

      {errorText ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-[#CD2317]">
          {errorText}
        </p>
      ) : (
        hint && <p className={`mt-1 ${hintClassName}`}>{hint}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// 메인: 비밀번호 변경
// ---------------------------------------------------------------------
export default function ChangePassword({ onChangePage }) {
  const [curr, setCurr] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  // 에러 상태
  const [currError, setCurrError] = useState(false);
  const [nextPolicyError, setNextPolicyError] = useState(false);
  const [sameAsCurrError, setSameAsCurrError] = useState(false);
  const [confirmError, setConfirmError] = useState(false);

  // 버튼: 모든 필드가 채워졌을 때만 활성화
  const submitEnabled = Boolean(curr && next && confirm);

  // 입력 중 에러 해제 로직
  const handleCurrChange = (v) => {
    setCurr(v);
    if (currError) setCurrError(false);
    if (sameAsCurrError && next !== v) setSameAsCurrError(false);
  };
  const handleNextChange = (v) => {
    setNext(v);
    if (nextPolicyError && policyRegex.test(v)) setNextPolicyError(false);
    if (sameAsCurrError && v !== curr) setSameAsCurrError(false);
    if (confirmError && v === confirm) setConfirmError(false);
  };
  const handleConfirmChange = (v) => {
    setConfirm(v);
    if (confirmError && v === next) setConfirmError(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // 일괄 검증
    const errs = validateOnSubmit({ curr, next, confirm });

    // 에러 상태 반영
    setCurrError(errs.currError);
    setNextPolicyError(errs.nextPolicyError);
    setSameAsCurrError(errs.sameAsCurrError);
    setConfirmError(errs.confirmError);

    // 하나라도 에러면 중단 (페이지 전환 X)
    if (errs.currError || errs.nextPolicyError || errs.sameAsCurrError || errs.confirmError) return;

    // TODO: 실제 API 연동
    console.log("[비밀번호 변경 요청]", { currentPassword: curr, newPassword: next });

    onChangePage?.("mypage");
  };

  // 새 비번 안내/문구 계산: 동일성 에러가 최우선, 그 외 정책 안내
  const newPwHasError = sameAsCurrError || nextPolicyError;
  const newPwErrorText = sameAsCurrError ? "현재 비밀번호와 다른 비밀번호를 입력하세요." : undefined;
  const newPwHintText = "영문 대소문자, 숫자, 특수문자(.!@#$%)를 포함한 8~20자";
  const newPwHintClass = nextPolicyError ? "text-[12px] text-[#CD2317]" : "text-[12px] text-[#A5A5A5]";

  return (
    <section className="px-10 py-10">
      <div className="mx-auto w-full max-w-[720px]">
        <h1 className="text-2xl font-bold mb-8">비밀번호 변경</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 현재 비밀번호 */}
          <PasswordTextField
            id="current-password"
            label="현재 비밀번호"
            value={curr}
            onChange={handleCurrChange}
            placeholder="현재 비밀번호를 입력하세요"
            autoComplete="current-password"
            error={currError}
            errorText={currError ? "현재 비밀번호가 일치하지 않습니다." : undefined}
          />

          {/* 새 비밀번호 */}
          <PasswordTextField
            id="new-password"
            label="새 비밀번호"
            value={next}
            onChange={handleNextChange}
            placeholder="새로운 비밀번호를 입력하세요"
            autoComplete="new-password"
            error={newPwHasError}
            errorText={newPwErrorText}
            hint={newPwHintText}
            hintClassName={newPwHintClass}
          />

          {/* 새 비밀번호 확인 */}
          <PasswordTextField
            id="confirm-password"
            label="새 비밀번호 확인"
            value={confirm}
            onChange={handleConfirmChange}
            placeholder="새로운 비밀번호를 다시 입력하세요"
            autoComplete="new-password"
            error={confirmError}
            errorText={confirmError ? "새 비밀번호가 일치하지 않습니다." : undefined}
          />

          {/* 하단 버튼 */}
          <div className="pt-6 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => onChangePage?.("mypage")}
              className="h-10 min-w-[112px] rounded-lg bg-neutral-200 text-neutral-700 px-6 hover:bg-neutral-300"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!submitEnabled}
              className="h-10 min-w-[112px] rounded-lg bg-neutral-700 text-white px-6 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              변경하기
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
