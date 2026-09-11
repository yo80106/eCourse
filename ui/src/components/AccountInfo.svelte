<script>
  import { onMount } from "svelte";
  import Icon from "@iconify/svelte";
  import { courses, progress, fetchAccountInfo } from "../lib/db";
  import { isSidebarVisible, isLoading } from "../lib/store";
  import { t } from "../lib/i18n";

  let registeredDate = null;
  let accountInfoLoading = true;

  onMount(async () => {
    const accountInfo = await fetchAccountInfo();
    registeredDate = toDate(accountInfo?.createdAt);
    accountInfoLoading = false;
  });

  // Firestore returns a Timestamp (has .toDate()); the record can also be
  // missing the field entirely for invites created before it existed.
  function toDate(value) {
    return value?.toDate ? value.toDate() : (value ?? null);
  }

  // completedAt/courseTitle are a permanent snapshot written once a course
  // first reaches 100% (see setCourseProgress in lib/db.js) -- this list is
  // a history, not a live "currently completed" view, so it still includes
  // courses no longer assigned, or since partially unchecked again.
  $: completedCourses = $progress
    .filter((record) => record.completedAt)
    .map((record) => ({
      id: record.id,
      title:
        record.courseTitle ??
        $courses.find((course) => course.id === record.course)?.title ??
        record.course,
      completedAt: toDate(record.completedAt),
    }))
    .sort((a, b) => b.completedAt - a.completedAt);
</script>

<section class="flex flex-1 flex-col gap-5 overflow-y-scroll bg-dark p-5">
  <div class="flex items-center gap-3">
    <button
      on:click={() => ($isSidebarVisible = !$isSidebarVisible)}
      class="group flex items-center justify-center rounded-full bg-transparent p-2 text-xl transition hover:bg-white/10"
    >
      <Icon
        class="flex-shrink-0 text-white/50 transition group-hover:text-white"
        icon="ph:list"
      />
    </button>
    <h1 class="text-base">
      {$t("accountInfo")}
    </h1>
  </div>

  {#if $isLoading || accountInfoLoading}
    <div class="w-full space-y-3">
      <div
        class="w-1/3 animate-pulse rounded-full bg-white/10 p-1 lg:max-w-28"
      ></div>
      <div
        class="w-full animate-pulse rounded-full bg-white/10 p-1 lg:max-w-96"
      ></div>
    </div>
  {:else}
    <div class="space-y-2">
      <h3 class="flex items-center gap-2 text-base text-white/50">
        <Icon class="flex-shrink-0 text-lg" icon="ph:calendar" />
        {$t("registeredDate")}
      </h3>
      <p class="rounded-md bg-white/5 p-3">
        {registeredDate
          ? registeredDate.toLocaleDateString()
          : $t("registeredDateUnavailable")}
      </p>
    </div>

    <div class="space-y-2">
      <h3 class="flex items-center gap-2 text-base text-white/50">
        <Icon class="flex-shrink-0 text-lg" icon="ph:check-circle" />
        {$t("coursesCompleted")}
      </h3>
      {#if completedCourses.length === 0}
        <p class="rounded-md bg-white/5 p-3 text-white/50">
          {$t("noCoursesCompleted")}
        </p>
      {:else}
        <div class="space-y-2">
          {#each completedCourses as record (record.id)}
            <div
              class="flex w-full items-center justify-between gap-5 rounded-md bg-white/5 p-3 sm:flex-col sm:items-start sm:gap-1"
            >
              <h3 class="line-clamp-1 truncate text-wrap break-all">
                {record.title}
              </h3>
              <h4 class="flex-shrink-0 text-white/50">
                {record.completedAt.toLocaleString()}
              </h4>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</section>
