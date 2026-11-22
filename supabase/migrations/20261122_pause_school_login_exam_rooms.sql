-- Pause experimental school sign-in and individual exam-room features.
-- Preserve all saved data and leave the original grade-storage RPCs unchanged.
revoke execute on function public.gs_exam_admin_history(), public.gs_exam_bind_student(text,text), public.gs_exam_lookup(text,text,text,jsonb), public.gs_exam_publish(text,text,text,text,text,jsonb), public.gs_exam_status(), public.gs_school_access(), public.gs_school_load(), public.gs_school_save(jsonb,bigint) from public, anon, authenticated;
