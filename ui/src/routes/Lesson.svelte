<script>
  import { onMount, tick } from "svelte";
  import { slide } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import {
    lessons,
    courses,
    progress,
    lesson_faqs,
    lesson_resources,
    fetchRecords,
    setCourseProgress,
    upsertLocalProgress,
  } from "../lib/db";
  import { currentUser } from "../lib/authStore";
  import { navigate, useLocation } from "svelte-routing";
  import Sidebar from "../components/Sidebar.svelte";
  import {
    isSidebarVisible,
    isLoading,
    getStoredLessons,
    storeLessons,
    showAlert,
  } from "../lib/store";
  import Icon from "@iconify/svelte";
  import { lessonSlug } from "../lib/strConverter";
  import NotFound from "./NotFound.svelte";
  import Title from "../components/Title.svelte";
  import { t } from "../lib/i18n";
  export let lessonTitle;

  let lessonLoading = {};
  let videoLoading = true;
  let currentCompletedLessons = [];
  let currentLessonTitle = "";
  let currentCourseId = "";
  let currentLessonId = "";

  const lessonLocation = useLocation();

  onMount(async () => {
    if ($currentUser) {
      $isLoading = true;
      await fetchRecords();
      $isLoading = false;
    } else {
      navigate("/login");
    }
  });

  // reset the video skeleton whenever navigating to a different lesson
  $: lessonTitle, (videoLoading = true);

  // find the current course status
  $: {
    const currentLesson = $lessons.find(
      (lesson) =>
        lessonSlug(lesson) === lessonTitle,
    );
    if (currentLesson) {
      currentLessonTitle = currentLesson.title;
      currentLessonId = currentLesson.id;
      currentCourseId = currentLesson.course;
      const currentCourse = $courses.find(
        (course) => course.id === currentLesson.course,
      );
      if (currentCourse) {
        const currentStatus = $progress.find(
          (progressRecord) => progressRecord.course === currentCourse.id,
        );
        if (currentStatus) {
          currentCompletedLessons = currentStatus.completedLessons ?? [];
        } else {
          currentCompletedLessons = [];
        }
      }
    }
  }

  // function to get lessons of the current course
  function getCourseLessons(courseId) {
    return $lessons.filter((lesson) => lesson.course === courseId);
  }

  // function to find the index of the current lesson within its course
  function findCurrentLessonIndex(courseLessons) {
    return courseLessons.findIndex(
      (lesson) =>
        lessonSlug(lesson) === lessonTitle,
    );
  }

  // function to navigate to the next lesson within the same course
  function goToNextLesson() {
    const currentLesson = $lessons.find(
      (lesson) =>
        lessonSlug(lesson) === lessonTitle,
    );
    if (currentLesson) {
      const courseLessons = getCourseLessons(currentLesson.course);
      const currentLessonIndex = findCurrentLessonIndex(courseLessons);
      if (
        currentLessonIndex >= 0 &&
        currentLessonIndex < courseLessons.length - 1
      ) {
        const nextLesson = courseLessons[currentLessonIndex + 1];
        navigate(
          `/${lessonSlug(nextLesson)}`,
        );

        const lessonsByCourse = getStoredLessons();
        lessonsByCourse[nextLesson.course] = nextLesson;
        storeLessons(lessonsByCourse);
      }
    }
  }

  // function to navigate to the previous lesson within the same course
  function goToPreviousLesson() {
    const currentLesson = $lessons.find(
      (lesson) =>
        lessonSlug(lesson) === lessonTitle,
    );
    if (currentLesson) {
      const courseLessons = getCourseLessons(currentLesson.course);
      const currentLessonIndex = findCurrentLessonIndex(courseLessons);
      if (currentLessonIndex > 0) {
        const previousLesson = courseLessons[currentLessonIndex - 1];
        navigate(
          `/${lessonSlug(previousLesson)}`,
        );

        const lessonsByCourse = getStoredLessons();
        lessonsByCourse[previousLesson.course] = previousLesson;
        storeLessons(lessonsByCourse);
      }
    }
  }

  // toggle an individual lesson's completed checkmark. Course completion is
  // derived (all lessons checked = course completed, see Courses.svelte)
  // rather than a separate manual status, so this is the only completion
  // action left on this page. Clicking again un-checks it.
  async function toggleLessonCompletion(lessonId, courseId) {
    const isCompleted = currentCompletedLessons.includes(lessonId);
    const updatedCompletedLessons = isCompleted
      ? currentCompletedLessons.filter((id) => id !== lessonId)
      : [...currentCompletedLessons, lessonId];

    lessonLoading[lessonId] = true;
    // checking/unchecking a lesson always implies the course is at least
    // "In Progress" -- writing this unconditionally (rather than reusing
    // whatever status the doc already had) is what makes a course that was
    // previously reset back to "Not Started" flip forward again the moment
    // its student marks any lesson complete.
    const updatedProgressRecord = await setCourseProgress(
      courseId,
      "In Progress",
      updatedCompletedLessons,
    );

    if (updatedProgressRecord) {
      await tick();
      upsertLocalProgress(updatedProgressRecord);

      const totalLessons = getCourseLessons(courseId).length;
      if (!isCompleted && updatedCompletedLessons.length === totalLessons) {
        const course = $courses.find((c) => c.id === courseId);
        showAlert(
          `${course.title.length > 30 ? course.title.slice(0, 30) + "..." : course.title} completed successfully`,
          "success",
        );
      }
    }

    lessonLoading[lessonId] = false;
  }
</script>

<Title title={currentLessonTitle} />

{#if $currentUser}
  <main class="flex h-dvh justify-between lg:overflow-x-hidden">
    <Sidebar
      isCoursesVisible={false}
      {currentCourseId}
      {currentLessonId}
    />
    {#if $isLoading}
      <div class="flex w-full flex-col gap-5 p-5">
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
          <div class="w-1/2 animate-pulse rounded-full bg-white/10 p-1"></div>
        </div>
        <div
          class="flex w-full flex-grow animate-pulse items-center justify-center rounded-md bg-white/10 p-5"
        >
          <Icon
            class="flex-shrink-0 text-6xl text-white/10"
            icon="svg-spinners:bars-scale-fade"
          />
        </div>
      </div>
    {:else if $lessons.length === 0 || $lessons.every((lesson) => lessonSlug(lesson) !== $lessonLocation.pathname.slice(1))}
      <NotFound page="lesson" />
    {:else}
      {#each $lessons as lesson (lesson.id)}
        {#if lessonSlug(lesson) === lessonTitle}
          <section
            class={$lesson_faqs.filter((faq) => faq.lesson.includes(lesson.id))
              .length > 0 ||
            $lesson_resources.filter((resource) =>
              resource.lesson.includes(lesson.id),
            ).length > 0 ||
            lesson.downloads?.length > 0
              ? "flex flex-1 flex-col justify-between gap-5 overflow-y-scroll bg-dark p-5"
              : "flex flex-1 flex-col justify-between overflow-y-scroll bg-dark p-5"}
          >
            <div class="space-y-5">
              <button
                on:click={() => navigate("/")}
                class="flex items-center gap-2 text-white/50 transition hover:text-white"
              >
                <Icon class="flex-shrink-0" icon="ph:arrow-left" />
                {$t("myCourses")}</button
              >
              <div
                class="flex items-end justify-between gap-5 sm:w-full sm:flex-col sm:items-start sm:gap-3"
              >
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
                  <h1 class="text-balance text-xl lg:text-lg">
                    {lesson.title}
                  </h1>
                </div>

                <div class="flex items-center gap-3 sm:w-full sm:flex-col">
                    {#if !findCurrentLessonIndex(getCourseLessons($lessons.find((lesson) => lessonSlug(lesson) === lessonTitle).course)) <= 0}
                      <button
                        on:click={goToPreviousLesson}
                        class="line-clamp-1 flex items-center justify-center gap-2 truncate rounded-md bg-white/10 px-4 py-2 outline outline-[1.5px] outline-white/20 transition hover:bg-white/20 sm:order-last sm:w-full"
                      >
                        <Icon class="flex-shrink-0" icon="ph:arrow-left" />
                        {$t("previousLesson")}
                      </button>
                    {/if}

                    {#if findCurrentLessonIndex(getCourseLessons($lessons.find((lesson) => lessonSlug(lesson) === lessonTitle).course)) < getCourseLessons($lessons.find((lesson) => lessonSlug(lesson) === lessonTitle).course).length - 1}
                      <button
                        on:click={goToNextLesson}
                        class="line-clamp-1 flex items-center justify-center gap-2 truncate rounded-md bg-main px-4 py-2 transition hover:bg-main/80 sm:order-first sm:w-full"
                      >
                        {$t("nextLesson")}
                        <Icon class="flex-shrink-0" icon="ph:arrow-right" />
                      </button>
                    {/if}
                </div>
              </div>

              {#if lesson.driveFileId}
                <div
                  class="relative aspect-video w-full overflow-hidden rounded-md bg-white/5"
                >
                  {#if videoLoading}
                    <div
                      class="absolute inset-0 flex animate-pulse items-center justify-center bg-white/10"
                    >
                      <Icon
                        class="flex-shrink-0 text-4xl text-white/20"
                        icon="svg-spinners:bars-scale-fade"
                      />
                    </div>
                  {/if}
                  <iframe
                    title={lesson.title}
                    src={`https://drive.google.com/file/d/${lesson.driveFileId}/preview`}
                    class="absolute inset-0 h-full w-full"
                    allow="autoplay"
                    on:load={() => (videoLoading = false)}
                  ></iframe>
                </div>
              {/if}

              {#if lesson.content}
                <div
                  class="flex w-full items-center justify-center rounded-md bg-white/5 p-[rfs(50px)] sm:p-5"
                >
                  <article
                    class="flex w-full max-w-[1280px] flex-1 flex-col gap-5 prose-headings:leading-tight prose-h1:text-50px prose-h2:text-40px prose-h3:text-30px prose-h4:text-25px prose-h5:text-20px prose-h6:text-18px prose-p:text-base prose-p:leading-relaxed prose-p:text-white/50 prose-a:text-base prose-a:text-main prose-a:underline prose-a:underline-offset-4 prose-blockquote:w-fit prose-blockquote:rounded-md prose-blockquote:border-l-2 prose-blockquote:border-l-white/50 prose-blockquote:bg-white/5 prose-blockquote:p-5 prose-strong:text-white prose-code:text-base prose-code:text-white/50 prose-ol:list-inside prose-ol:list-decimal prose-ol:space-y-2 prose-ol:text-base
                    prose-ul:list-inside prose-ul:list-disc prose-ul:space-y-2 prose-ul:text-base prose-img:w-full prose-img:rounded-md"
                  >
                    {@html lesson.content}
                  </article>
                </div>
              {/if}

              {#if lesson.summary}
                <div class="space-y-2">
                  <h3 class="flex items-center gap-2 text-base">
                    <Icon icon="ph:text-align-left flex-shrink-0" />
                    {$t("summary")}
                  </h3>
                  <p class="text-white/50">
                    {lesson.summary}
                  </p>
                </div>
              {/if}
            </div>

            <div
              class="flex w-full items-start justify-between gap-5 md:flex-col"
            >
              {#if $lesson_faqs.filter( (faq) => faq.lesson.includes(lesson.id), ).length > 0}
                <div class="flex-1 space-y-4 md:w-full">
                  <h2 class="flex items-center gap-2 text-base">
                    <Icon class="flex-shrink-0" icon="ph:chats" />
                    FAQs
                  </h2>
                  {#each $lesson_faqs as faq}
                    {#if faq.lesson.includes(lesson.id)}
                      <button
                        on:click={() => (faq.isOpen = !faq.isOpen)}
                        class="w-full space-y-2 rounded-md bg-white/10 p-2 outline outline-[1.5px] outline-white/20 transition hover:bg-white/20"
                      >
                        <div
                          class="flex items-center justify-between gap-2 text-start"
                        >
                          <h3 class="line-clamp-1">
                            {faq.question}
                          </h3>
                          <Icon
                            class={faq.isOpen
                              ? "flex-shrink-0 rotate-45 transition"
                              : "flex-shrink-0 transition"}
                            icon="ph:plus"
                          />
                        </div>
                        {#if faq.isOpen}
                          <p
                            transition:slide={{
                              duration: 250,
                              easing: quintOut,
                            }}
                            class="text-start text-white/60"
                          >
                            {faq.answer}
                          </p>
                        {/if}
                      </button>
                    {/if}
                  {/each}
                </div>
              {/if}

              {#if $lesson_resources.filter( (resource) => resource.lesson.includes(lesson.id), ).length > 0}
                <div class="flex-1 space-y-4 md:w-full">
                  <h2 class="flex items-center gap-2 text-base">
                    <Icon class="flex-shrink-0" icon="ph:link" />
                    Resources
                  </h2>
                  {#each $lesson_resources as resource}
                    {#if resource.lesson.includes(lesson.id)}
                      <a
                        href={resource.link}
                        target="_blank"
                        class="block w-full rounded-md bg-white/10 p-2 outline outline-[1.5px] outline-white/20 transition hover:bg-white/20"
                      >
                        <div class="flex items-center justify-between gap-2">
                          <h3 class="line-clamp-1">{resource.name}</h3>
                          <Icon
                            class="flex-shrink-0"
                            icon="ph:arrow-up-right"
                          />
                        </div>
                      </a>
                    {/if}
                  {/each}
                </div>
              {/if}

              {#if lesson.downloads?.length > 0}
                <div class="flex-1 space-y-4 md:w-full">
                  <h2 class="flex items-center gap-2 text-base">
                    <Icon class="flex-shrink-0" icon="ph:file" />
                    {$t("downloads")}
                  </h2>
                  {#each lesson.downloads as download}
                    <a
                      href={download.link}
                      target="_blank"
                      class="block w-full rounded-md bg-white/10 p-2 outline outline-[1.5px] outline-white/20 transition hover:bg-white/20"
                    >
                      <div class="flex items-center justify-between gap-2">
                        <h3 class="line-clamp-1">{download.name}</h3>
                        <Icon class="flex-shrink-0" icon="ph:download-simple" />
                      </div>
                    </a>
                  {/each}
                </div>
              {/if}
            </div>

            <div
              class="flex w-full items-center justify-center border-t-[1.5px] border-t-white/10 pt-5"
            >
              <button
                on:click={() => toggleLessonCompletion(lesson.id, lesson.course)}
                class={lessonLoading[lesson.id]
                  ? "pointer-events-none line-clamp-1 flex items-center justify-center gap-2 truncate rounded-md bg-emerald-400/60 px-4 py-2 opacity-50 transition hover:bg-emerald-400/50 sm:w-full"
                  : currentCompletedLessons.includes(lesson.id)
                    ? "line-clamp-1 flex items-center justify-center gap-2 truncate rounded-md bg-emerald-400/60 px-4 py-2 transition hover:bg-emerald-400/50 sm:w-full"
                    : "line-clamp-1 flex items-center justify-center gap-2 truncate rounded-md bg-white/10 px-4 py-2 outline outline-[1.5px] outline-white/20 transition hover:bg-white/20 sm:w-full"}
              >
                {currentCompletedLessons.includes(lesson.id)
                  ? $t("lessonCompleted")
                  : $t("completeLesson")}
                {#if lessonLoading[lesson.id]}
                  <Icon
                    class="flex-shrink-0 animate-spin text-base"
                    icon="fluent:spinner-ios-16-regular"
                  />
                {:else}
                  <Icon class="flex-shrink-0" icon="ph:check" />
                {/if}
              </button>
            </div>
          </section>
        {/if}
      {/each}
    {/if}
  </main>
{/if}
