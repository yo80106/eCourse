<script>
  import { Router, Route } from "svelte-routing";
  import { currentUser, authReady } from "./lib/authStore";
  import NotFound from "./routes/NotFound.svelte";
  import Login from "./routes/Login.svelte";
  import MyCourses from "./routes/MyCourses.svelte";
  import Lesson from "./routes/Lesson.svelte";
  import Search from "./components/Search.svelte";
  import Alert from "./components/Alert.svelte";
  import Icon from "@iconify/svelte";
  import { t, locale, locales } from "./lib/i18n";
</script>

{#if !$authReady}
  <main class="flex h-dvh items-center justify-center">
    <Icon
      class="flex-shrink-0 text-6xl text-white/10"
      icon="svg-spinners:bars-scale-fade"
    />
  </main>
{:else}
  {#if $currentUser}
    <Search />
    <Alert />
  {/if}

  <Router>
    <Route path="/" component={MyCourses} />
    <Route path="/login" component={Login} />
    <Route path="/:lessonTitle" component={Lesson} />
    <Route component={NotFound} />
  </Router>
{/if}
