<template>
  <div class="editor-container mx-auto px-3 sm:px-6 flex-1 flex flex-col pt-6 sm:pt-8 w-full max-w-full sm:max-w-6xl">
    <div class="header mb-4 border-b pb-2" :class="darkMode ? 'border-gray-700' : 'border-gray-200'">
      <h2 class="text-xl font-semibold">{{ $t("markdown.title") }}</h2>
    </div>

    <div
      v-if="!hasPermission"
      class="mb-4 p-3 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-700/50 dark:text-yellow-200"
    >
      <div class="flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>
          {{ $t("markdown.permissionRequired") }}
          <a href="#" class="font-medium underline" @click.prevent="navigateToAdmin">{{ $t("markdown.loginOrAuth") }}</a>。
        </span>
      </div>
    </div>

    <div class="editor-wrapper">
      <textarea
        v-model="content"
        class="w-full border rounded-lg p-3 min-h-[420px] sm:min-h-[520px] resize-y"
        :class="getInputClasses()"
        :placeholder="$t('markdown.placeholder')"
        :disabled="!hasPermission || isSubmitting"
      />
    </div>

    <div class="mt-6 border-t pt-4 w-full overflow-hidden" :class="darkMode ? 'border-gray-700' : 'border-gray-200'">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div class="form-group">
          <label class="form-label" :class="darkMode ? 'text-gray-300' : 'text-gray-700'">{{ $t("markdown.form.remark") }}</label>
          <input v-model="formData.remark" type="text" class="form-input" :class="getInputClasses()" :placeholder="$t('markdown.form.remarkPlaceholder')" :disabled="!hasPermission" />
        </div>

        <div class="form-group">
          <label class="form-label" :class="darkMode ? 'text-gray-300' : 'text-gray-700'">{{ $t("markdown.form.customLink") }}</label>
          <input
            v-model="formData.customLink"
            type="text"
            class="form-input"
            :class="[getInputClasses(), slugError ? (darkMode ? 'border-red-500' : 'border-red-600') : '']"
            :placeholder="$t('markdown.form.customLinkPlaceholder')"
            :disabled="!hasPermission"
            @input="validateCustomLink"
          />
          <p v-if="slugError" class="mt-1 text-sm" :class="darkMode ? 'text-red-400' : 'text-red-600'">{{ slugError }}</p>
          <p v-else class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ $t("markdown.onlyAllowedChars") }}</p>
        </div>

        <div class="form-group">
          <label class="form-label" :class="darkMode ? 'text-gray-300' : 'text-gray-700'">{{ $t("markdown.form.password") }}</label>
          <input v-model="formData.password" type="text" class="form-input" :class="getInputClasses()" :placeholder="$t('markdown.form.passwordPlaceholder')" :disabled="!hasPermission" />
        </div>

        <div class="form-group">
          <label class="form-label" :class="darkMode ? 'text-gray-300' : 'text-gray-700'">{{ $t("markdown.form.expireTime") }}</label>
          <select v-model="formData.expiryTime" class="form-input" :class="getInputClasses()" :disabled="!hasPermission">
            <option value="1">{{ $t("markdown.form.expireOptions.hour1") }}</option>
            <option value="24">{{ $t("markdown.form.expireOptions.day1") }}</option>
            <option value="168">{{ $t("markdown.form.expireOptions.day7") }}</option>
            <option value="720">{{ $t("markdown.form.expireOptions.day30") }}</option>
            <option value="0">{{ $t("markdown.form.expireOptions.never") }}</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" :class="darkMode ? 'text-gray-300' : 'text-gray-700'">{{ $t("markdown.form.maxViews") }}</label>
          <input
            v-model.number="formData.maxViews"
            type="number"
            min="0"
            step="1"
            pattern="\d*"
            class="form-input"
            :class="getInputClasses()"
            :placeholder="$t('markdown.form.maxViewsPlaceholder')"
            :disabled="!hasPermission"
            @input="validateMaxViews"
          />
        </div>
      </div>

      <div class="submit-section mt-6 flex flex-row items-center gap-4">
        <button class="btn-primary" :disabled="isSubmitting || !hasPermission" @click="saveContent">
          {{ isSubmitting ? $t("markdown.processing") : $t("markdown.createShare") }}
        </button>

        <div v-if="savingStatus" class="saving-status ml-auto text-sm">
          <span :class="[isErrorMessage(savingStatus) ? (darkMode ? 'text-red-400' : 'text-red-600') : darkMode ? 'text-gray-300' : 'text-gray-600']">{{ savingStatus }}</span>
        </div>
      </div>

      <div v-if="shareLink" class="mt-4 p-3 rounded-md share-link-box" :class="darkMode ? 'bg-gray-800/50' : 'bg-gray-50'">
        <div class="flex items-center">
          <span class="text-sm mr-2" :class="darkMode ? 'text-gray-400' : 'text-gray-500'">{{ $t("markdown.shareLink") }}</span>
          <a :href="shareLink" target="_blank" class="link-text text-sm flex-grow" :class="darkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-500'">
            {{ shareLink }}
          </a>

          <button
            class="ml-2 p-1 rounded-md transition-colors"
            :class="darkMode ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' : 'hover:bg-gray-200 text-gray-500 hover:text-gray-700'"
            :title="$t('markdown.copyLink')"
            @click="copyShareLink"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
          </button>

          <button
            class="ml-2 p-1 rounded-md transition-colors"
            :class="darkMode ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' : 'hover:bg-gray-200 text-gray-500 hover:text-gray-700'"
            :title="$t('markdown.copyRawLink')"
            @click="copyRawTextLink"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.172 13.828a4 4 0 015.656 0l4 4a4 4 0 01-5.656 5.656l-1.102-1.101" />
            </svg>
          </button>

          <span class="ml-2 text-xs" :class="darkMode ? 'text-gray-500' : 'text-gray-400'">{{ countdown }} {{ $t("markdown.disappearIn") }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, defineProps } from "vue";
import { useI18n } from "vue-i18n";
import { createPaste, getRawPasteUrl } from "../api/pasteService";
import { ApiStatus } from "../api/ApiStatus";

const { t } = useI18n();

const props = defineProps({
  darkMode: {
    type: Boolean,
    default: false,
  },
});

const content = ref("");
const savingStatus = ref("");
const isSubmitting = ref(false);
const shareLink = ref("");
const countdown = ref(15);
const slugError = ref("");
const currentSharePassword = ref("");
let countdownTimer = null;

const isAdmin = ref(false);
const hasApiKey = ref(false);
const hasTextPermission = ref(false);
const hasPermission = ref(false);

const formData = ref({
  remark: "",
  customLink: "",
  password: "",
  expiryTime: "0",
  maxViews: 0,
});

let apiKeyValidationTimer = null;
let lastValidatedApiKey = null;
let lastValidationTime = 0;
const VALIDATION_DEBOUNCE_TIME = 2000;

const getInputClasses = () => {
  return props.darkMode
    ? "bg-gray-800 border-gray-700 text-gray-100 focus:ring-primary-600 focus:border-primary-600"
    : "bg-white border-gray-300 text-gray-900 focus:ring-primary-500 focus:border-primary-500";
};

const validateApiKey = async (apiKey) => {
  const now = Date.now();
  if (apiKey === lastValidatedApiKey && now - lastValidationTime < VALIDATION_DEBOUNCE_TIME) {
    return hasTextPermission.value;
  }

  if (apiKeyValidationTimer) {
    clearTimeout(apiKeyValidationTimer);
  }

  return new Promise((resolve, reject) => {
    apiKeyValidationTimer = setTimeout(async () => {
      try {
        const { getFullApiUrl } = await import("../api/config.js");
        const apiUrl = getFullApiUrl("test/api-key");

        const response = await fetch(apiUrl, {
          method: "GET",
          headers: {
            Authorization: `ApiKey ${apiKey}`,
            "Content-Type": "application/json",
          },
          credentials: "omit",
        });

        if (!response.ok) {
          throw new Error(`API密钥验证失败 (${response.status})`);
        }

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.message || "密钥验证失败");
        }

        lastValidatedApiKey = apiKey;
        lastValidationTime = Date.now();

        const permissions = data.data?.permissions || {};
        localStorage.setItem("api_key_permissions", JSON.stringify(permissions));
        const textPermission = !!permissions.text;
        hasTextPermission.value = textPermission;

        window.dispatchEvent(
          new CustomEvent("api-key-permissions-updated", {
            detail: { permissions },
          }),
        );

        resolve(textPermission);
      } catch (error) {
        reject(error);
      } finally {
        apiKeyValidationTimer = null;
      }
    }, 50);
  });
};

const checkPermissionStatus = async () => {
  isAdmin.value = !!localStorage.getItem("admin_token");
  if (isAdmin.value) {
    hasPermission.value = true;
    return;
  }

  const apiKey = localStorage.getItem("api_key");
  hasApiKey.value = !!apiKey;

  if (hasApiKey.value && apiKey) {
    try {
      hasTextPermission.value = await validateApiKey(apiKey);
    } catch {
      const permissionsStr = localStorage.getItem("api_key_permissions");
      if (permissionsStr) {
        const permissions = JSON.parse(permissionsStr);
        hasTextPermission.value = !!permissions.text;
      } else {
        hasTextPermission.value = false;
      }
    }
  } else {
    hasTextPermission.value = false;
  }

  hasPermission.value = isAdmin.value || (hasApiKey.value && hasTextPermission.value);
};

const validateCustomLink = () => {
  slugError.value = "";
  if (!formData.value.customLink) {
    return true;
  }

  const slugRegex = /^[a-zA-Z0-9_-]+$/;
  if (!slugRegex.test(formData.value.customLink)) {
    slugError.value = t("markdown.invalidFormat");
    return false;
  }

  return true;
};

const validateMaxViews = (event) => {
  const value = event.target.value;
  if (value < 0) {
    formData.value.maxViews = 0;
    return;
  }

  if (value.toString().includes(".")) {
    formData.value.maxViews = parseInt(value);
  }

  if (isNaN(value) || value === "") {
    formData.value.maxViews = 0;
  } else {
    formData.value.maxViews = parseInt(value);
  }
};

const isErrorMessage = (message) => {
  return message.includes("失败") || message.includes("错误") || message.includes("链接后缀已被占用") || message.includes("不能");
};

const startCountdown = () => {
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }

  countdown.value = 15;
  countdownTimer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) {
      clearInterval(countdownTimer);
      shareLink.value = "";
      currentSharePassword.value = "";
    }
  }, 1000);
};

const resetForm = () => {
  formData.value = {
    remark: "",
    customLink: "",
    password: "",
    expiryTime: "0",
    maxViews: 0,
  };
};

const saveContent = async () => {
  await checkPermissionStatus();
  if (!hasPermission.value) {
    savingStatus.value = t("markdown.errorNoPermission");
    return;
  }

  if (!validateCustomLink()) {
    savingStatus.value = slugError.value;
    return;
  }

  if (!content.value || content.value.trim() === "") {
    savingStatus.value = t("markdown.errorEmptyContent");
    return;
  }

  isSubmitting.value = true;
  savingStatus.value = t("markdown.creatingShare");

  try {
    const pasteData = {
      content: content.value,
      slug: formData.value.customLink || undefined,
      remark: formData.value.remark || undefined,
      password: formData.value.password || undefined,
      maxViews: formData.value.maxViews > 0 ? formData.value.maxViews : undefined,
    };

    const expiryHours = parseInt(formData.value.expiryTime);
    if (expiryHours > 0) {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + expiryHours);
      pasteData.expiresAt = expiresAt.toISOString();
    }

    const result = await createPaste(pasteData);
    shareLink.value = `${window.location.origin}/paste/${result.slug}`;
    currentSharePassword.value = formData.value.password || "";

    savingStatus.value = t("markdown.shareCreatedSuccess");
    startCountdown();
    content.value = "";
    resetForm();
  } catch (error) {
    if (
      (error.message && error.message.includes("权限")) ||
      error.status === ApiStatus.FORBIDDEN ||
      error.response?.status === ApiStatus.FORBIDDEN ||
      error.code === ApiStatus.FORBIDDEN ||
      error.message.includes(ApiStatus.FORBIDDEN.toString())
    ) {
      if (hasApiKey.value) {
        localStorage.removeItem("api_key_permissions");
        await checkPermissionStatus();
      }
      savingStatus.value = t("markdown.errorPermissionDenied");
    } else {
      savingStatus.value = `${t("markdown.errorPrefix")}: ${error.message || t("markdown.errorCreateShareFailed")}`;
    }
  } finally {
    isSubmitting.value = false;
  }
};

const copyShareLink = () => {
  if (!shareLink.value) return;

  navigator.clipboard
    .writeText(shareLink.value)
    .then(() => {
      savingStatus.value = t("markdown.linkCopied");
      setTimeout(() => {
        savingStatus.value = "";
      }, 2000);
    })
    .catch(() => {
      savingStatus.value = t("markdown.copyFailed");
    });
};

const copyRawTextLink = () => {
  if (!shareLink.value) return;

  const slug = shareLink.value.split("/").pop();
  const rawLink = getRawPasteUrl(slug, currentSharePassword.value || null);

  navigator.clipboard
    .writeText(rawLink)
    .then(() => {
      savingStatus.value = t("markdown.rawLinkCopied");
      setTimeout(() => {
        savingStatus.value = "";
      }, 2000);
    })
    .catch(() => {
      savingStatus.value = t("markdown.copyFailed");
    });
};

const navigateToAdmin = () => {
  window.history.pushState({}, "", "/admin");
  window.dispatchEvent(new Event("popstate"));
};

const handlePermissionUpdate = async () => {
  await checkPermissionStatus();
};

onMounted(async () => {
  await checkPermissionStatus();

  content.value = localStorage.getItem("cloudpaste-content") || "";

  window.addEventListener("storage", handlePermissionUpdate);
  window.addEventListener("api-key-permissions-updated", handlePermissionUpdate);
});

onUnmounted(() => {
  localStorage.setItem("cloudpaste-content", content.value || "");
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }

  window.removeEventListener("storage", handlePermissionUpdate);
  window.removeEventListener("api-key-permissions-updated", handlePermissionUpdate);
});
</script>
