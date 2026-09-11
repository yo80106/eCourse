<script>
  import { onMount } from "svelte";
  import { currentUser } from "../lib/authStore";
  import { fetchRecords } from "../lib/db";
  import { isLoading } from "../lib/store";
  import Sidebar from "../components/Sidebar.svelte";
  import AccountInfo from "../components/AccountInfo.svelte";
  import { navigate } from "svelte-routing";
  import Title from "../components/Title.svelte";
  import { t } from "../lib/i18n";

  onMount(async () => {
    if ($currentUser) {
      $isLoading = true;
      await fetchRecords();
      $isLoading = false;
    } else {
      navigate("/login");
    }
  });
</script>

<Title suffix={$t("accountInfo")} />

{#if $currentUser}
  <main class="flex h-dvh justify-between lg:overflow-x-hidden">
    <Sidebar isCoursesVisible={false} isAccountVisible={true} />
    <AccountInfo />
  </main>
{/if}
