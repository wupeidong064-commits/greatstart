export const purchaseLessonsRule = {
  validator: (_: unknown, value: unknown) => {
    const text = String(value ?? '').trim();
    return /^\d+$/.test(text) && Number(text) > 0 && Number(text) <= 2147483647
      ? Promise.resolve()
      : Promise.reject(new Error('课时须为 1 至 2147483647 的整数'));
  },
};

export const purchasePriceRule = {
  validator: (_: unknown, value: unknown) => /^\d{1,8}(?:\.\d{1,2})?$/.test(String(value ?? '').trim())
    ? Promise.resolve()
    : Promise.reject(new Error('金额须为 0 至 99999999.99，最多两位小数')),
};
