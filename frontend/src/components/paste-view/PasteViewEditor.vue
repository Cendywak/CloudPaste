<script setup>
// PasteViewEditor组件 - 提供纯文本编辑及相关配置功能
// 内容使用普通文本框编辑，保存时原样提交，不做任何格式处理
import { ref, watch } from "vue";
import { getInputClasses } from "./PasteViewUtils";
import { rawTextareaAttrs, insertTabOnKeydown } from "../../utils/plainText";

// 定义组件接收的属性
const props = defineProps({
  // 是否为暗色模式
  darkMode: {
    type: Boolean,
    required: true,
  },
  // 要编辑的文本内容
  content: {
    type: String,
    default: "",
  },
  // 文本分享对象，包含元数据
  paste: {
    type: Object,
    default: () => ({}),
  },
  // 是否处于加载状态
  loading: {
    type: Boolean,
    default: false,
  },
  // 错误信息
  error: {
    type: String,
    default: "",
  },
});

// 定义组件可触发的事件
const emit = defineEmits(["save", "cancel", "update:error"]);

// 编辑中的文本内容
const editText = ref(props.content);
// 编辑表单数据，包含元数据设置
const editForm = ref({
  remark: props.paste?.remark || "",
  customLink: props.paste?.slug || "",
  expiryTime: "24", // 默认为1天
  maxViews: props.paste?.maxViews || 0,
  password: "", // 新增密码字段
  clearPassword: false, // 新增是否清除密码的标志
});

// 密码可见性控制
const showPassword = ref(false);

// 监听内容变化，同步到编辑框
watch(
  () => props.content,
  (newContent) => {
    editText.value = newContent;
  }
);

// 监听paste对象变化，更新表单数据
watch(
  () => props.paste,
  (newPaste) => {
    if (newPaste) {
      // 初始化编辑表单数据
      editForm.value.remark = newPaste.remark || "";
      editForm.value.customLink = newPaste.slug || "";
      // 密码字段重置为空字符串
      editForm.value.password = "";
      editForm.value.clearPassword = false;

      // 处理过期时间 - 将ISO日期转换为选择项值
      if (newPaste.expiresAt) {
        const expiryDate = new Date(newPaste.expiresAt);
        const now = new Date();
        const diffHours = Math.round((expiryDate - now) / (1000 * 60 * 60));

        // 根据剩余时间选择最接近的预设选项
        if (diffHours <= 1) {
          editForm.value.expiryTime = "1";
        } else if (diffHours <= 24) {
          editForm.value.expiryTime = "24";
        } else if (diffHours <= 168) {
          editForm.value.expiryTime = "168";
        } else if (diffHours <= 720) {
          editForm.value.expiryTime = "720";
        } else {
          editForm.value.expiryTime = "0"; // 设置为永不过期
        }
      } else {
        editForm.value.expiryTime = "0"; // 永不过期
      }

      // 最大查看次数
      editForm.value.maxViews = newPaste.maxViews || 0;
    }
  },
  { immediate: true }
);

// 保存编辑内容，收集所有表单数据并触发保存事件
const saveEdit = () => {
  const newContent = editText.value;
  // 检查文本内容是否为空
  if (!newContent.trim()) {
    emit("update:error", "内容不能为空");
    return;
  }

  // 准备更新数据对象，包含内容和元数据
  const updateData = {
    content: newContent,
    remark: editForm.value.remark || null,
    maxViews: editForm.value.maxViews === 0 ? null : parseInt(editForm.value.maxViews),
  };

  // 处理密码
  if (editForm.value.password.trim()) {
    updateData.password = editForm.value.password;
  } else if (editForm.value.clearPassword) {
    updateData.clearPassword = true;
  }

  // 处理过期时间 - 将选择值转换为ISO日期
  if (editForm.value.expiryTime !== "0") {
    const hours = parseInt(editForm.value.expiryTime);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + hours);
    updateData.expiresAt = expiresAt.toISOString();
  } else {
    updateData.expiresAt = null; // 永不过期
  }

  // 触发保存事件，将数据传递给父组件
  emit("save", updateData);
};

// 取消编辑，返回到预览模式
const cancelEdit = () => {
  emit("cancel");
};

// 验证可打开次数输入，确保输入合法
const validateMaxViews = () => {
  const value = editForm.value.maxViews;

  // 如果是负数，则设置为0
  if (value < 0) {
    editForm.value.maxViews = 0;
    return;
  }

  // 确保值为有效数字
  if (isNaN(value) || value === "") {
    editForm.value.maxViews = 0;
  } else {
    // 确保是整数
    editForm.value.maxViews = parseInt(value);
  }
};

// 获取当前编辑内容的辅助方法
const getCurrentContent = () => editText.value;

// 暴露方法供父组件调用
defineExpose({
  getCurrentContent,
});
</script>

<template>
  <div class="paste-view-editor">
    <textarea
      v-model="editText"
      v-bind="rawTextareaAttrs"
      class="plain-textarea w-full border rounded-lg p-3 min-h-[420px] sm:min-h-[520px] resize-y focus:outline-none focus:ring-2"
      :class="getInputClasses(darkMode)"
      :disabled="loading"
      @keydown="insertTabOnKeydown"
    />

    <!-- 元数据编辑表单 - 允许编辑备注、过期时间等 -->
    <div class="mt-6 border-t pt-4" :class="darkMode ? 'border-gray-700' : 'border-gray-200'">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <!-- 链接后缀 - 不可修改 -->
        <div class="form-group">
          <label class="form-label block mb-1 text-sm font-medium" :class="darkMode ? 'text-gray-300' : 'text-gray-700'">链接后缀</label>
          <input
            type="text"
            class="form-input w-full rounded-md shadow-sm cursor-not-allowed opacity-75"
            :class="getInputClasses(darkMode)"
            placeholder="不可修改"
            v-model="editForm.customLink"
            disabled
          />
          <p class="mt-1 text-xs" :class="darkMode ? 'text-gray-500' : 'text-gray-400'">后缀不可修改，仅支持字母、数字、-和_</p>
        </div>

        <!-- 备注信息 -->
        <div class="form-group">
          <label class="form-label block mb-1 text-sm font-medium" :class="darkMode ? 'text-gray-300' : 'text-gray-700'">备注(可选)</label>
          <input type="text" class="form-input w-full rounded-md shadow-sm" :class="getInputClasses(darkMode)" placeholder="添加备注信息..." v-model="editForm.remark" />
        </div>

        <!-- 过期时间选择 -->
        <div class="form-group">
          <label class="form-label block mb-1 text-sm font-medium" :class="darkMode ? 'text-gray-300' : 'text-gray-700'">过期时间</label>
          <select class="form-input w-full rounded-md shadow-sm" :class="getInputClasses(darkMode)" v-model="editForm.expiryTime">
            <option value="1">1小时</option>
            <option value="24">1天</option>
            <option value="168">7天</option>
            <option value="720">30天</option>
            <option value="0">永不过期</option>
          </select>
        </div>

        <!-- 可打开次数设置 -->
        <div class="form-group">
          <label class="form-label block mb-1 text-sm font-medium" :class="darkMode ? 'text-gray-300' : 'text-gray-700'">可打开次数(0表示无限制)</label>
          <input
            type="number"
            min="0"
            step="1"
            pattern="\d*"
            class="form-input w-full rounded-md shadow-sm"
            :class="getInputClasses(darkMode)"
            placeholder="0表示无限制"
            v-model.number="editForm.maxViews"
            @input="validateMaxViews"
          />
        </div>

        <!-- 密码设置 -->
        <div class="form-group">
          <label class="form-label block mb-1 text-sm font-medium" :class="darkMode ? 'text-gray-300' : 'text-gray-700'">访问密码</label>
          <div class="flex items-center space-x-2">
            <input
              :type="showPassword ? 'text' : 'password'"
              class="form-input w-full rounded-md shadow-sm"
              :class="getInputClasses(darkMode)"
              placeholder="设置访问密码..."
              v-model="editForm.password"
              :disabled="editForm.clearPassword"
            />
          </div>
          <div class="mt-2 flex items-center">
            <input
              type="checkbox"
              id="clear-password"
              class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              :class="darkMode ? 'bg-gray-700 border-gray-600' : ''"
              v-model="editForm.clearPassword"
            />
            <label for="clear-password" class="ml-2 text-xs" :class="darkMode ? 'text-gray-400' : 'text-gray-600'"> 清除访问密码 </label>
          </div>
          <p class="mt-1 text-xs" :class="darkMode ? 'text-gray-500' : 'text-gray-400'">
            {{ editForm.clearPassword ? "将移除密码保护" : props.paste?.hasPassword ? "留空表示保持原密码不变" : "设置密码后，他人访问需要输入密码" }}
          </p>
        </div>
      </div>

      <!-- 保存和取消按钮 -->
      <div class="submit-section mt-6 flex flex-row items-center gap-4">
        <button
          @click="saveEdit"
          class="btn-primary px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
          :disabled="loading"
        >
          {{ loading ? "保存中..." : "保存修改" }}
        </button>

        <button
          @click="cancelEdit"
          class="px-4 py-2 text-sm font-medium border rounded-md transition-colors"
          :class="darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-50'"
          title="取消编辑并恢复原始内容"
        >
          取消
        </button>

        <!-- 状态提示信息 -->
        <div class="saving-status ml-auto text-sm" v-if="error">
          <span :class="[error.includes('成功') ? (darkMode ? 'text-green-400' : 'text-green-600') : darkMode ? 'text-red-400' : 'text-red-600']">
            {{ error }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.paste-view-editor {
  width: 100%;
}

.plain-textarea {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 0.875rem;
  line-height: 1.6;
  tab-size: 4;
}

/* 输入框与下拉框统一高度，保持同一行对齐 */
.form-input {
  height: 2.5rem;
}
</style>
