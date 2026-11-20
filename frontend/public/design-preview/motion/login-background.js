var sx = Object.defineProperty;
var ax = (e, t, n) => t in e ? sx(e, t, { enumerable: !0, configurable: !0, writable: !0, value: n }) : e[t] = n;
var ue = (e, t, n) => ax(e, typeof t != "symbol" ? t + "" : t, n);
function ux(e) {
  return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, "default") ? e.default : e;
}
var bg = { exports: {} }, _u = {}, Eg = { exports: {} }, ne = {};
/**
 * @license React
 * react.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var ys = Symbol.for("react.element"), lx = Symbol.for("react.portal"), cx = Symbol.for("react.fragment"), dx = Symbol.for("react.strict_mode"), fx = Symbol.for("react.profiler"), mx = Symbol.for("react.provider"), px = Symbol.for("react.context"), hx = Symbol.for("react.forward_ref"), vx = Symbol.for("react.suspense"), gx = Symbol.for("react.memo"), yx = Symbol.for("react.lazy"), Bp = Symbol.iterator;
function wx(e) {
  return e === null || typeof e != "object" ? null : (e = Bp && e[Bp] || e["@@iterator"], typeof e == "function" ? e : null);
}
var kg = { isMounted: function() {
  return !1;
}, enqueueForceUpdate: function() {
}, enqueueReplaceState: function() {
}, enqueueSetState: function() {
} }, Pg = Object.assign, Ig = {};
function Yo(e, t, n) {
  this.props = e, this.context = t, this.refs = Ig, this.updater = n || kg;
}
Yo.prototype.isReactComponent = {};
Yo.prototype.setState = function(e, t) {
  if (typeof e != "object" && typeof e != "function" && e != null) throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");
  this.updater.enqueueSetState(this, e, t, "setState");
};
Yo.prototype.forceUpdate = function(e) {
  this.updater.enqueueForceUpdate(this, e, "forceUpdate");
};
function Tg() {
}
Tg.prototype = Yo.prototype;
function Sf(e, t, n) {
  this.props = e, this.context = t, this.refs = Ig, this.updater = n || kg;
}
var xf = Sf.prototype = new Tg();
xf.constructor = Sf;
Pg(xf, Yo.prototype);
xf.isPureReactComponent = !0;
var Up = Array.isArray, Rg = Object.prototype.hasOwnProperty, Cf = { current: null }, Fg = { key: !0, ref: !0, __self: !0, __source: !0 };
function Mg(e, t, n) {
  var r, o = {}, i = null, s = null;
  if (t != null) for (r in t.ref !== void 0 && (s = t.ref), t.key !== void 0 && (i = "" + t.key), t) Rg.call(t, r) && !Fg.hasOwnProperty(r) && (o[r] = t[r]);
  var a = arguments.length - 2;
  if (a === 1) o.children = n;
  else if (1 < a) {
    for (var u = Array(a), c = 0; c < a; c++) u[c] = arguments[c + 2];
    o.children = u;
  }
  if (e && e.defaultProps) for (r in a = e.defaultProps, a) o[r] === void 0 && (o[r] = a[r]);
  return { $$typeof: ys, type: e, key: i, ref: s, props: o, _owner: Cf.current };
}
function Sx(e, t) {
  return { $$typeof: ys, type: e.type, key: t, ref: e.ref, props: e.props, _owner: e._owner };
}
function bf(e) {
  return typeof e == "object" && e !== null && e.$$typeof === ys;
}
function xx(e) {
  var t = { "=": "=0", ":": "=2" };
  return "$" + e.replace(/[=:]/g, function(n) {
    return t[n];
  });
}
var Wp = /\/+/g;
function Kl(e, t) {
  return typeof e == "object" && e !== null && e.key != null ? xx("" + e.key) : t.toString(36);
}
function $a(e, t, n, r, o) {
  var i = typeof e;
  (i === "undefined" || i === "boolean") && (e = null);
  var s = !1;
  if (e === null) s = !0;
  else switch (i) {
    case "string":
    case "number":
      s = !0;
      break;
    case "object":
      switch (e.$$typeof) {
        case ys:
        case lx:
          s = !0;
      }
  }
  if (s) return s = e, o = o(s), e = r === "" ? "." + Kl(s, 0) : r, Up(o) ? (n = "", e != null && (n = e.replace(Wp, "$&/") + "/"), $a(o, t, n, "", function(c) {
    return c;
  })) : o != null && (bf(o) && (o = Sx(o, n + (!o.key || s && s.key === o.key ? "" : ("" + o.key).replace(Wp, "$&/") + "/") + e)), t.push(o)), 1;
  if (s = 0, r = r === "" ? "." : r + ":", Up(e)) for (var a = 0; a < e.length; a++) {
    i = e[a];
    var u = r + Kl(i, a);
    s += $a(i, t, n, u, o);
  }
  else if (u = wx(e), typeof u == "function") for (e = u.call(e), a = 0; !(i = e.next()).done; ) i = i.value, u = r + Kl(i, a++), s += $a(i, t, n, u, o);
  else if (i === "object") throw t = String(e), Error("Objects are not valid as a React child (found: " + (t === "[object Object]" ? "object with keys {" + Object.keys(e).join(", ") + "}" : t) + "). If you meant to render a collection of children, use an array instead.");
  return s;
}
function Hs(e, t, n) {
  if (e == null) return e;
  var r = [], o = 0;
  return $a(e, r, "", "", function(i) {
    return t.call(n, i, o++);
  }), r;
}
function Cx(e) {
  if (e._status === -1) {
    var t = e._result;
    t = t(), t.then(function(n) {
      (e._status === 0 || e._status === -1) && (e._status = 1, e._result = n);
    }, function(n) {
      (e._status === 0 || e._status === -1) && (e._status = 2, e._result = n);
    }), e._status === -1 && (e._status = 0, e._result = t);
  }
  if (e._status === 1) return e._result.default;
  throw e._result;
}
var tt = { current: null }, _a = { transition: null }, bx = { ReactCurrentDispatcher: tt, ReactCurrentBatchConfig: _a, ReactCurrentOwner: Cf };
function Ng() {
  throw Error("act(...) is not supported in production builds of React.");
}
ne.Children = { map: Hs, forEach: function(e, t, n) {
  Hs(e, function() {
    t.apply(this, arguments);
  }, n);
}, count: function(e) {
  var t = 0;
  return Hs(e, function() {
    t++;
  }), t;
}, toArray: function(e) {
  return Hs(e, function(t) {
    return t;
  }) || [];
}, only: function(e) {
  if (!bf(e)) throw Error("React.Children.only expected to receive a single React element child.");
  return e;
} };
ne.Component = Yo;
ne.Fragment = cx;
ne.Profiler = fx;
ne.PureComponent = Sf;
ne.StrictMode = dx;
ne.Suspense = vx;
ne.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = bx;
ne.act = Ng;
ne.cloneElement = function(e, t, n) {
  if (e == null) throw Error("React.cloneElement(...): The argument must be a React element, but you passed " + e + ".");
  var r = Pg({}, e.props), o = e.key, i = e.ref, s = e._owner;
  if (t != null) {
    if (t.ref !== void 0 && (i = t.ref, s = Cf.current), t.key !== void 0 && (o = "" + t.key), e.type && e.type.defaultProps) var a = e.type.defaultProps;
    for (u in t) Rg.call(t, u) && !Fg.hasOwnProperty(u) && (r[u] = t[u] === void 0 && a !== void 0 ? a[u] : t[u]);
  }
  var u = arguments.length - 2;
  if (u === 1) r.children = n;
  else if (1 < u) {
    a = Array(u);
    for (var c = 0; c < u; c++) a[c] = arguments[c + 2];
    r.children = a;
  }
  return { $$typeof: ys, type: e.type, key: o, ref: i, props: r, _owner: s };
};
ne.createContext = function(e) {
  return e = { $$typeof: px, _currentValue: e, _currentValue2: e, _threadCount: 0, Provider: null, Consumer: null, _defaultValue: null, _globalName: null }, e.Provider = { $$typeof: mx, _context: e }, e.Consumer = e;
};
ne.createElement = Mg;
ne.createFactory = function(e) {
  var t = Mg.bind(null, e);
  return t.type = e, t;
};
ne.createRef = function() {
  return { current: null };
};
ne.forwardRef = function(e) {
  return { $$typeof: hx, render: e };
};
ne.isValidElement = bf;
ne.lazy = function(e) {
  return { $$typeof: yx, _payload: { _status: -1, _result: e }, _init: Cx };
};
ne.memo = function(e, t) {
  return { $$typeof: gx, type: e, compare: t === void 0 ? null : t };
};
ne.startTransition = function(e) {
  var t = _a.transition;
  _a.transition = {};
  try {
    e();
  } finally {
    _a.transition = t;
  }
};
ne.unstable_act = Ng;
ne.useCallback = function(e, t) {
  return tt.current.useCallback(e, t);
};
ne.useContext = function(e) {
  return tt.current.useContext(e);
};
ne.useDebugValue = function() {
};
ne.useDeferredValue = function(e) {
  return tt.current.useDeferredValue(e);
};
ne.useEffect = function(e, t) {
  return tt.current.useEffect(e, t);
};
ne.useId = function() {
  return tt.current.useId();
};
ne.useImperativeHandle = function(e, t, n) {
  return tt.current.useImperativeHandle(e, t, n);
};
ne.useInsertionEffect = function(e, t) {
  return tt.current.useInsertionEffect(e, t);
};
ne.useLayoutEffect = function(e, t) {
  return tt.current.useLayoutEffect(e, t);
};
ne.useMemo = function(e, t) {
  return tt.current.useMemo(e, t);
};
ne.useReducer = function(e, t, n) {
  return tt.current.useReducer(e, t, n);
};
ne.useRef = function(e) {
  return tt.current.useRef(e);
};
ne.useState = function(e) {
  return tt.current.useState(e);
};
ne.useSyncExternalStore = function(e, t, n) {
  return tt.current.useSyncExternalStore(e, t, n);
};
ne.useTransition = function() {
  return tt.current.useTransition();
};
ne.version = "18.3.1";
Eg.exports = ne;
var l = Eg.exports;
const D = /* @__PURE__ */ ux(l);
/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var Ex = l, kx = Symbol.for("react.element"), Px = Symbol.for("react.fragment"), Ix = Object.prototype.hasOwnProperty, Tx = Ex.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner, Rx = { key: !0, ref: !0, __self: !0, __source: !0 };
function $g(e, t, n) {
  var r, o = {}, i = null, s = null;
  n !== void 0 && (i = "" + n), t.key !== void 0 && (i = "" + t.key), t.ref !== void 0 && (s = t.ref);
  for (r in t) Ix.call(t, r) && !Rx.hasOwnProperty(r) && (o[r] = t[r]);
  if (e && e.defaultProps) for (r in t = e.defaultProps, t) o[r] === void 0 && (o[r] = t[r]);
  return { $$typeof: kx, type: e, key: i, ref: s, props: o, _owner: Tx.current };
}
_u.Fragment = Px;
_u.jsx = $g;
_u.jsxs = $g;
bg.exports = _u;
var S = bg.exports, _g = { exports: {} }, xt = {}, Ag = { exports: {} }, Lg = {};
/**
 * @license React
 * scheduler.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
(function(e) {
  function t(A, T) {
    var M = A.length;
    A.push(T);
    e: for (; 0 < M; ) {
      var R = M - 1 >>> 1, $ = A[R];
      if (0 < o($, T)) A[R] = T, A[M] = $, M = R;
      else break e;
    }
  }
  function n(A) {
    return A.length === 0 ? null : A[0];
  }
  function r(A) {
    if (A.length === 0) return null;
    var T = A[0], M = A.pop();
    if (M !== T) {
      A[0] = M;
      e: for (var R = 0, $ = A.length, z = $ >>> 1; R < z; ) {
        var q = 2 * (R + 1) - 1, H = A[q], U = q + 1, K = A[U];
        if (0 > o(H, M)) U < $ && 0 > o(K, H) ? (A[R] = K, A[U] = M, R = U) : (A[R] = H, A[q] = M, R = q);
        else if (U < $ && 0 > o(K, M)) A[R] = K, A[U] = M, R = U;
        else break e;
      }
    }
    return T;
  }
  function o(A, T) {
    var M = A.sortIndex - T.sortIndex;
    return M !== 0 ? M : A.id - T.id;
  }
  if (typeof performance == "object" && typeof performance.now == "function") {
    var i = performance;
    e.unstable_now = function() {
      return i.now();
    };
  } else {
    var s = Date, a = s.now();
    e.unstable_now = function() {
      return s.now() - a;
    };
  }
  var u = [], c = [], d = 1, m = null, f = 3, v = !1, h = !1, w = !1, x = typeof setTimeout == "function" ? setTimeout : null, g = typeof clearTimeout == "function" ? clearTimeout : null, p = typeof setImmediate < "u" ? setImmediate : null;
  typeof navigator < "u" && navigator.scheduling !== void 0 && navigator.scheduling.isInputPending !== void 0 && navigator.scheduling.isInputPending.bind(navigator.scheduling);
  function y(A) {
    for (var T = n(c); T !== null; ) {
      if (T.callback === null) r(c);
      else if (T.startTime <= A) r(c), T.sortIndex = T.expirationTime, t(u, T);
      else break;
      T = n(c);
    }
  }
  function C(A) {
    if (w = !1, y(A), !h) if (n(u) !== null) h = !0, V(b);
    else {
      var T = n(c);
      T !== null && B(C, T.startTime - A);
    }
  }
  function b(A, T) {
    h = !1, w && (w = !1, g(P), P = -1), v = !0;
    var M = f;
    try {
      for (y(T), m = n(u); m !== null && (!(m.expirationTime > T) || A && !L()); ) {
        var R = m.callback;
        if (typeof R == "function") {
          m.callback = null, f = m.priorityLevel;
          var $ = R(m.expirationTime <= T);
          T = e.unstable_now(), typeof $ == "function" ? m.callback = $ : m === n(u) && r(u), y(T);
        } else r(u);
        m = n(u);
      }
      if (m !== null) var z = !0;
      else {
        var q = n(c);
        q !== null && B(C, q.startTime - T), z = !1;
      }
      return z;
    } finally {
      m = null, f = M, v = !1;
    }
  }
  var E = !1, k = null, P = -1, F = 5, I = -1;
  function L() {
    return !(e.unstable_now() - I < F);
  }
  function _() {
    if (k !== null) {
      var A = e.unstable_now();
      I = A;
      var T = !0;
      try {
        T = k(!0, A);
      } finally {
        T ? O() : (E = !1, k = null);
      }
    } else E = !1;
  }
  var O;
  if (typeof p == "function") O = function() {
    p(_);
  };
  else if (typeof MessageChannel < "u") {
    var N = new MessageChannel(), j = N.port2;
    N.port1.onmessage = _, O = function() {
      j.postMessage(null);
    };
  } else O = function() {
    x(_, 0);
  };
  function V(A) {
    k = A, E || (E = !0, O());
  }
  function B(A, T) {
    P = x(function() {
      A(e.unstable_now());
    }, T);
  }
  e.unstable_IdlePriority = 5, e.unstable_ImmediatePriority = 1, e.unstable_LowPriority = 4, e.unstable_NormalPriority = 3, e.unstable_Profiling = null, e.unstable_UserBlockingPriority = 2, e.unstable_cancelCallback = function(A) {
    A.callback = null;
  }, e.unstable_continueExecution = function() {
    h || v || (h = !0, V(b));
  }, e.unstable_forceFrameRate = function(A) {
    0 > A || 125 < A ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : F = 0 < A ? Math.floor(1e3 / A) : 5;
  }, e.unstable_getCurrentPriorityLevel = function() {
    return f;
  }, e.unstable_getFirstCallbackNode = function() {
    return n(u);
  }, e.unstable_next = function(A) {
    switch (f) {
      case 1:
      case 2:
      case 3:
        var T = 3;
        break;
      default:
        T = f;
    }
    var M = f;
    f = T;
    try {
      return A();
    } finally {
      f = M;
    }
  }, e.unstable_pauseExecution = function() {
  }, e.unstable_requestPaint = function() {
  }, e.unstable_runWithPriority = function(A, T) {
    switch (A) {
      case 1:
      case 2:
      case 3:
      case 4:
      case 5:
        break;
      default:
        A = 3;
    }
    var M = f;
    f = A;
    try {
      return T();
    } finally {
      f = M;
    }
  }, e.unstable_scheduleCallback = function(A, T, M) {
    var R = e.unstable_now();
    switch (typeof M == "object" && M !== null ? (M = M.delay, M = typeof M == "number" && 0 < M ? R + M : R) : M = R, A) {
      case 1:
        var $ = -1;
        break;
      case 2:
        $ = 250;
        break;
      case 5:
        $ = 1073741823;
        break;
      case 4:
        $ = 1e4;
        break;
      default:
        $ = 5e3;
    }
    return $ = M + $, A = { id: d++, callback: T, priorityLevel: A, startTime: M, expirationTime: $, sortIndex: -1 }, M > R ? (A.sortIndex = M, t(c, A), n(u) === null && A === n(c) && (w ? (g(P), P = -1) : w = !0, B(C, M - R))) : (A.sortIndex = $, t(u, A), h || v || (h = !0, V(b))), A;
  }, e.unstable_shouldYield = L, e.unstable_wrapCallback = function(A) {
    var T = f;
    return function() {
      var M = f;
      f = T;
      try {
        return A.apply(this, arguments);
      } finally {
        f = M;
      }
    };
  };
})(Lg);
Ag.exports = Lg;
var Fx = Ag.exports;
/**
 * @license React
 * react-dom.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var Mx = l, St = Fx;
function W(e) {
  for (var t = "https://reactjs.org/docs/error-decoder.html?invariant=" + e, n = 1; n < arguments.length; n++) t += "&args[]=" + encodeURIComponent(arguments[n]);
  return "Minified React error #" + e + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
}
var Og = /* @__PURE__ */ new Set(), Qi = {};
function Lr(e, t) {
  Vo(e, t), Vo(e + "Capture", t);
}
function Vo(e, t) {
  for (Qi[e] = t, e = 0; e < t.length; e++) Og.add(t[e]);
}
var Tn = !(typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u"), Bc = Object.prototype.hasOwnProperty, Nx = /^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/, qp = {}, Hp = {};
function $x(e) {
  return Bc.call(Hp, e) ? !0 : Bc.call(qp, e) ? !1 : Nx.test(e) ? Hp[e] = !0 : (qp[e] = !0, !1);
}
function _x(e, t, n, r) {
  if (n !== null && n.type === 0) return !1;
  switch (typeof t) {
    case "function":
    case "symbol":
      return !0;
    case "boolean":
      return r ? !1 : n !== null ? !n.acceptsBooleans : (e = e.toLowerCase().slice(0, 5), e !== "data-" && e !== "aria-");
    default:
      return !1;
  }
}
function Ax(e, t, n, r) {
  if (t === null || typeof t > "u" || _x(e, t, n, r)) return !0;
  if (r) return !1;
  if (n !== null) switch (n.type) {
    case 3:
      return !t;
    case 4:
      return t === !1;
    case 5:
      return isNaN(t);
    case 6:
      return isNaN(t) || 1 > t;
  }
  return !1;
}
function nt(e, t, n, r, o, i, s) {
  this.acceptsBooleans = t === 2 || t === 3 || t === 4, this.attributeName = r, this.attributeNamespace = o, this.mustUseProperty = n, this.propertyName = e, this.type = t, this.sanitizeURL = i, this.removeEmptyString = s;
}
var Be = {};
"children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(e) {
  Be[e] = new nt(e, 0, !1, e, null, !1, !1);
});
[["acceptCharset", "accept-charset"], ["className", "class"], ["htmlFor", "for"], ["httpEquiv", "http-equiv"]].forEach(function(e) {
  var t = e[0];
  Be[t] = new nt(t, 1, !1, e[1], null, !1, !1);
});
["contentEditable", "draggable", "spellCheck", "value"].forEach(function(e) {
  Be[e] = new nt(e, 2, !1, e.toLowerCase(), null, !1, !1);
});
["autoReverse", "externalResourcesRequired", "focusable", "preserveAlpha"].forEach(function(e) {
  Be[e] = new nt(e, 2, !1, e, null, !1, !1);
});
"allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(e) {
  Be[e] = new nt(e, 3, !1, e.toLowerCase(), null, !1, !1);
});
["checked", "multiple", "muted", "selected"].forEach(function(e) {
  Be[e] = new nt(e, 3, !0, e, null, !1, !1);
});
["capture", "download"].forEach(function(e) {
  Be[e] = new nt(e, 4, !1, e, null, !1, !1);
});
["cols", "rows", "size", "span"].forEach(function(e) {
  Be[e] = new nt(e, 6, !1, e, null, !1, !1);
});
["rowSpan", "start"].forEach(function(e) {
  Be[e] = new nt(e, 5, !1, e.toLowerCase(), null, !1, !1);
});
var Ef = /[\-:]([a-z])/g;
function kf(e) {
  return e[1].toUpperCase();
}
"accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(e) {
  var t = e.replace(
    Ef,
    kf
  );
  Be[t] = new nt(t, 1, !1, e, null, !1, !1);
});
"xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(e) {
  var t = e.replace(Ef, kf);
  Be[t] = new nt(t, 1, !1, e, "http://www.w3.org/1999/xlink", !1, !1);
});
["xml:base", "xml:lang", "xml:space"].forEach(function(e) {
  var t = e.replace(Ef, kf);
  Be[t] = new nt(t, 1, !1, e, "http://www.w3.org/XML/1998/namespace", !1, !1);
});
["tabIndex", "crossOrigin"].forEach(function(e) {
  Be[e] = new nt(e, 1, !1, e.toLowerCase(), null, !1, !1);
});
Be.xlinkHref = new nt("xlinkHref", 1, !1, "xlink:href", "http://www.w3.org/1999/xlink", !0, !1);
["src", "href", "action", "formAction"].forEach(function(e) {
  Be[e] = new nt(e, 1, !1, e.toLowerCase(), null, !0, !0);
});
function Pf(e, t, n, r) {
  var o = Be.hasOwnProperty(t) ? Be[t] : null;
  (o !== null ? o.type !== 0 : r || !(2 < t.length) || t[0] !== "o" && t[0] !== "O" || t[1] !== "n" && t[1] !== "N") && (Ax(t, n, o, r) && (n = null), r || o === null ? $x(t) && (n === null ? e.removeAttribute(t) : e.setAttribute(t, "" + n)) : o.mustUseProperty ? e[o.propertyName] = n === null ? o.type === 3 ? !1 : "" : n : (t = o.attributeName, r = o.attributeNamespace, n === null ? e.removeAttribute(t) : (o = o.type, n = o === 3 || o === 4 && n === !0 ? "" : "" + n, r ? e.setAttributeNS(r, t, n) : e.setAttribute(t, n))));
}
var Nn = Mx.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED, Ks = Symbol.for("react.element"), mo = Symbol.for("react.portal"), po = Symbol.for("react.fragment"), If = Symbol.for("react.strict_mode"), Uc = Symbol.for("react.profiler"), jg = Symbol.for("react.provider"), Dg = Symbol.for("react.context"), Tf = Symbol.for("react.forward_ref"), Wc = Symbol.for("react.suspense"), qc = Symbol.for("react.suspense_list"), Rf = Symbol.for("react.memo"), Hn = Symbol.for("react.lazy"), Vg = Symbol.for("react.offscreen"), Kp = Symbol.iterator;
function di(e) {
  return e === null || typeof e != "object" ? null : (e = Kp && e[Kp] || e["@@iterator"], typeof e == "function" ? e : null);
}
var Ce = Object.assign, Gl;
function Ni(e) {
  if (Gl === void 0) try {
    throw Error();
  } catch (n) {
    var t = n.stack.trim().match(/\n( *(at )?)/);
    Gl = t && t[1] || "";
  }
  return `
` + Gl + e;
}
var Yl = !1;
function Ql(e, t) {
  if (!e || Yl) return "";
  Yl = !0;
  var n = Error.prepareStackTrace;
  Error.prepareStackTrace = void 0;
  try {
    if (t) if (t = function() {
      throw Error();
    }, Object.defineProperty(t.prototype, "props", { set: function() {
      throw Error();
    } }), typeof Reflect == "object" && Reflect.construct) {
      try {
        Reflect.construct(t, []);
      } catch (c) {
        var r = c;
      }
      Reflect.construct(e, [], t);
    } else {
      try {
        t.call();
      } catch (c) {
        r = c;
      }
      e.call(t.prototype);
    }
    else {
      try {
        throw Error();
      } catch (c) {
        r = c;
      }
      e();
    }
  } catch (c) {
    if (c && r && typeof c.stack == "string") {
      for (var o = c.stack.split(`
`), i = r.stack.split(`
`), s = o.length - 1, a = i.length - 1; 1 <= s && 0 <= a && o[s] !== i[a]; ) a--;
      for (; 1 <= s && 0 <= a; s--, a--) if (o[s] !== i[a]) {
        if (s !== 1 || a !== 1)
          do
            if (s--, a--, 0 > a || o[s] !== i[a]) {
              var u = `
` + o[s].replace(" at new ", " at ");
              return e.displayName && u.includes("<anonymous>") && (u = u.replace("<anonymous>", e.displayName)), u;
            }
          while (1 <= s && 0 <= a);
        break;
      }
    }
  } finally {
    Yl = !1, Error.prepareStackTrace = n;
  }
  return (e = e ? e.displayName || e.name : "") ? Ni(e) : "";
}
function Lx(e) {
  switch (e.tag) {
    case 5:
      return Ni(e.type);
    case 16:
      return Ni("Lazy");
    case 13:
      return Ni("Suspense");
    case 19:
      return Ni("SuspenseList");
    case 0:
    case 2:
    case 15:
      return e = Ql(e.type, !1), e;
    case 11:
      return e = Ql(e.type.render, !1), e;
    case 1:
      return e = Ql(e.type, !0), e;
    default:
      return "";
  }
}
function Hc(e) {
  if (e == null) return null;
  if (typeof e == "function") return e.displayName || e.name || null;
  if (typeof e == "string") return e;
  switch (e) {
    case po:
      return "Fragment";
    case mo:
      return "Portal";
    case Uc:
      return "Profiler";
    case If:
      return "StrictMode";
    case Wc:
      return "Suspense";
    case qc:
      return "SuspenseList";
  }
  if (typeof e == "object") switch (e.$$typeof) {
    case Dg:
      return (e.displayName || "Context") + ".Consumer";
    case jg:
      return (e._context.displayName || "Context") + ".Provider";
    case Tf:
      var t = e.render;
      return e = e.displayName, e || (e = t.displayName || t.name || "", e = e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef"), e;
    case Rf:
      return t = e.displayName || null, t !== null ? t : Hc(e.type) || "Memo";
    case Hn:
      t = e._payload, e = e._init;
      try {
        return Hc(e(t));
      } catch {
      }
  }
  return null;
}
function Ox(e) {
  var t = e.type;
  switch (e.tag) {
    case 24:
      return "Cache";
    case 9:
      return (t.displayName || "Context") + ".Consumer";
    case 10:
      return (t._context.displayName || "Context") + ".Provider";
    case 18:
      return "DehydratedFragment";
    case 11:
      return e = t.render, e = e.displayName || e.name || "", t.displayName || (e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef");
    case 7:
      return "Fragment";
    case 5:
      return t;
    case 4:
      return "Portal";
    case 3:
      return "Root";
    case 6:
      return "Text";
    case 16:
      return Hc(t);
    case 8:
      return t === If ? "StrictMode" : "Mode";
    case 22:
      return "Offscreen";
    case 12:
      return "Profiler";
    case 21:
      return "Scope";
    case 13:
      return "Suspense";
    case 19:
      return "SuspenseList";
    case 25:
      return "TracingMarker";
    case 1:
    case 0:
    case 17:
    case 2:
    case 14:
    case 15:
      if (typeof t == "function") return t.displayName || t.name || null;
      if (typeof t == "string") return t;
  }
  return null;
}
function ar(e) {
  switch (typeof e) {
    case "boolean":
    case "number":
    case "string":
    case "undefined":
      return e;
    case "object":
      return e;
    default:
      return "";
  }
}
function zg(e) {
  var t = e.type;
  return (e = e.nodeName) && e.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
}
function jx(e) {
  var t = zg(e) ? "checked" : "value", n = Object.getOwnPropertyDescriptor(e.constructor.prototype, t), r = "" + e[t];
  if (!e.hasOwnProperty(t) && typeof n < "u" && typeof n.get == "function" && typeof n.set == "function") {
    var o = n.get, i = n.set;
    return Object.defineProperty(e, t, { configurable: !0, get: function() {
      return o.call(this);
    }, set: function(s) {
      r = "" + s, i.call(this, s);
    } }), Object.defineProperty(e, t, { enumerable: n.enumerable }), { getValue: function() {
      return r;
    }, setValue: function(s) {
      r = "" + s;
    }, stopTracking: function() {
      e._valueTracker = null, delete e[t];
    } };
  }
}
function Gs(e) {
  e._valueTracker || (e._valueTracker = jx(e));
}
function Bg(e) {
  if (!e) return !1;
  var t = e._valueTracker;
  if (!t) return !0;
  var n = t.getValue(), r = "";
  return e && (r = zg(e) ? e.checked ? "true" : "false" : e.value), e = r, e !== n ? (t.setValue(e), !0) : !1;
}
function eu(e) {
  if (e = e || (typeof document < "u" ? document : void 0), typeof e > "u") return null;
  try {
    return e.activeElement || e.body;
  } catch {
    return e.body;
  }
}
function Kc(e, t) {
  var n = t.checked;
  return Ce({}, t, { defaultChecked: void 0, defaultValue: void 0, value: void 0, checked: n ?? e._wrapperState.initialChecked });
}
function Gp(e, t) {
  var n = t.defaultValue == null ? "" : t.defaultValue, r = t.checked != null ? t.checked : t.defaultChecked;
  n = ar(t.value != null ? t.value : n), e._wrapperState = { initialChecked: r, initialValue: n, controlled: t.type === "checkbox" || t.type === "radio" ? t.checked != null : t.value != null };
}
function Ug(e, t) {
  t = t.checked, t != null && Pf(e, "checked", t, !1);
}
function Gc(e, t) {
  Ug(e, t);
  var n = ar(t.value), r = t.type;
  if (n != null) r === "number" ? (n === 0 && e.value === "" || e.value != n) && (e.value = "" + n) : e.value !== "" + n && (e.value = "" + n);
  else if (r === "submit" || r === "reset") {
    e.removeAttribute("value");
    return;
  }
  t.hasOwnProperty("value") ? Yc(e, t.type, n) : t.hasOwnProperty("defaultValue") && Yc(e, t.type, ar(t.defaultValue)), t.checked == null && t.defaultChecked != null && (e.defaultChecked = !!t.defaultChecked);
}
function Yp(e, t, n) {
  if (t.hasOwnProperty("value") || t.hasOwnProperty("defaultValue")) {
    var r = t.type;
    if (!(r !== "submit" && r !== "reset" || t.value !== void 0 && t.value !== null)) return;
    t = "" + e._wrapperState.initialValue, n || t === e.value || (e.value = t), e.defaultValue = t;
  }
  n = e.name, n !== "" && (e.name = ""), e.defaultChecked = !!e._wrapperState.initialChecked, n !== "" && (e.name = n);
}
function Yc(e, t, n) {
  (t !== "number" || eu(e.ownerDocument) !== e) && (n == null ? e.defaultValue = "" + e._wrapperState.initialValue : e.defaultValue !== "" + n && (e.defaultValue = "" + n));
}
var $i = Array.isArray;
function Ro(e, t, n, r) {
  if (e = e.options, t) {
    t = {};
    for (var o = 0; o < n.length; o++) t["$" + n[o]] = !0;
    for (n = 0; n < e.length; n++) o = t.hasOwnProperty("$" + e[n].value), e[n].selected !== o && (e[n].selected = o), o && r && (e[n].defaultSelected = !0);
  } else {
    for (n = "" + ar(n), t = null, o = 0; o < e.length; o++) {
      if (e[o].value === n) {
        e[o].selected = !0, r && (e[o].defaultSelected = !0);
        return;
      }
      t !== null || e[o].disabled || (t = e[o]);
    }
    t !== null && (t.selected = !0);
  }
}
function Qc(e, t) {
  if (t.dangerouslySetInnerHTML != null) throw Error(W(91));
  return Ce({}, t, { value: void 0, defaultValue: void 0, children: "" + e._wrapperState.initialValue });
}
function Qp(e, t) {
  var n = t.value;
  if (n == null) {
    if (n = t.children, t = t.defaultValue, n != null) {
      if (t != null) throw Error(W(92));
      if ($i(n)) {
        if (1 < n.length) throw Error(W(93));
        n = n[0];
      }
      t = n;
    }
    t == null && (t = ""), n = t;
  }
  e._wrapperState = { initialValue: ar(n) };
}
function Wg(e, t) {
  var n = ar(t.value), r = ar(t.defaultValue);
  n != null && (n = "" + n, n !== e.value && (e.value = n), t.defaultValue == null && e.defaultValue !== n && (e.defaultValue = n)), r != null && (e.defaultValue = "" + r);
}
function Jp(e) {
  var t = e.textContent;
  t === e._wrapperState.initialValue && t !== "" && t !== null && (e.value = t);
}
function qg(e) {
  switch (e) {
    case "svg":
      return "http://www.w3.org/2000/svg";
    case "math":
      return "http://www.w3.org/1998/Math/MathML";
    default:
      return "http://www.w3.org/1999/xhtml";
  }
}
function Jc(e, t) {
  return e == null || e === "http://www.w3.org/1999/xhtml" ? qg(t) : e === "http://www.w3.org/2000/svg" && t === "foreignObject" ? "http://www.w3.org/1999/xhtml" : e;
}
var Ys, Hg = function(e) {
  return typeof MSApp < "u" && MSApp.execUnsafeLocalFunction ? function(t, n, r, o) {
    MSApp.execUnsafeLocalFunction(function() {
      return e(t, n, r, o);
    });
  } : e;
}(function(e, t) {
  if (e.namespaceURI !== "http://www.w3.org/2000/svg" || "innerHTML" in e) e.innerHTML = t;
  else {
    for (Ys = Ys || document.createElement("div"), Ys.innerHTML = "<svg>" + t.valueOf().toString() + "</svg>", t = Ys.firstChild; e.firstChild; ) e.removeChild(e.firstChild);
    for (; t.firstChild; ) e.appendChild(t.firstChild);
  }
});
function Ji(e, t) {
  if (t) {
    var n = e.firstChild;
    if (n && n === e.lastChild && n.nodeType === 3) {
      n.nodeValue = t;
      return;
    }
  }
  e.textContent = t;
}
var Vi = {
  animationIterationCount: !0,
  aspectRatio: !0,
  borderImageOutset: !0,
  borderImageSlice: !0,
  borderImageWidth: !0,
  boxFlex: !0,
  boxFlexGroup: !0,
  boxOrdinalGroup: !0,
  columnCount: !0,
  columns: !0,
  flex: !0,
  flexGrow: !0,
  flexPositive: !0,
  flexShrink: !0,
  flexNegative: !0,
  flexOrder: !0,
  gridArea: !0,
  gridRow: !0,
  gridRowEnd: !0,
  gridRowSpan: !0,
  gridRowStart: !0,
  gridColumn: !0,
  gridColumnEnd: !0,
  gridColumnSpan: !0,
  gridColumnStart: !0,
  fontWeight: !0,
  lineClamp: !0,
  lineHeight: !0,
  opacity: !0,
  order: !0,
  orphans: !0,
  tabSize: !0,
  widows: !0,
  zIndex: !0,
  zoom: !0,
  fillOpacity: !0,
  floodOpacity: !0,
  stopOpacity: !0,
  strokeDasharray: !0,
  strokeDashoffset: !0,
  strokeMiterlimit: !0,
  strokeOpacity: !0,
  strokeWidth: !0
}, Dx = ["Webkit", "ms", "Moz", "O"];
Object.keys(Vi).forEach(function(e) {
  Dx.forEach(function(t) {
    t = t + e.charAt(0).toUpperCase() + e.substring(1), Vi[t] = Vi[e];
  });
});
function Kg(e, t, n) {
  return t == null || typeof t == "boolean" || t === "" ? "" : n || typeof t != "number" || t === 0 || Vi.hasOwnProperty(e) && Vi[e] ? ("" + t).trim() : t + "px";
}
function Gg(e, t) {
  e = e.style;
  for (var n in t) if (t.hasOwnProperty(n)) {
    var r = n.indexOf("--") === 0, o = Kg(n, t[n], r);
    n === "float" && (n = "cssFloat"), r ? e.setProperty(n, o) : e[n] = o;
  }
}
var Vx = Ce({ menuitem: !0 }, { area: !0, base: !0, br: !0, col: !0, embed: !0, hr: !0, img: !0, input: !0, keygen: !0, link: !0, meta: !0, param: !0, source: !0, track: !0, wbr: !0 });
function Zc(e, t) {
  if (t) {
    if (Vx[e] && (t.children != null || t.dangerouslySetInnerHTML != null)) throw Error(W(137, e));
    if (t.dangerouslySetInnerHTML != null) {
      if (t.children != null) throw Error(W(60));
      if (typeof t.dangerouslySetInnerHTML != "object" || !("__html" in t.dangerouslySetInnerHTML)) throw Error(W(61));
    }
    if (t.style != null && typeof t.style != "object") throw Error(W(62));
  }
}
function Xc(e, t) {
  if (e.indexOf("-") === -1) return typeof t.is == "string";
  switch (e) {
    case "annotation-xml":
    case "color-profile":
    case "font-face":
    case "font-face-src":
    case "font-face-uri":
    case "font-face-format":
    case "font-face-name":
    case "missing-glyph":
      return !1;
    default:
      return !0;
  }
}
var ed = null;
function Ff(e) {
  return e = e.target || e.srcElement || window, e.correspondingUseElement && (e = e.correspondingUseElement), e.nodeType === 3 ? e.parentNode : e;
}
var td = null, Fo = null, Mo = null;
function Zp(e) {
  if (e = xs(e)) {
    if (typeof td != "function") throw Error(W(280));
    var t = e.stateNode;
    t && (t = Du(t), td(e.stateNode, e.type, t));
  }
}
function Yg(e) {
  Fo ? Mo ? Mo.push(e) : Mo = [e] : Fo = e;
}
function Qg() {
  if (Fo) {
    var e = Fo, t = Mo;
    if (Mo = Fo = null, Zp(e), t) for (e = 0; e < t.length; e++) Zp(t[e]);
  }
}
function Jg(e, t) {
  return e(t);
}
function Zg() {
}
var Jl = !1;
function Xg(e, t, n) {
  if (Jl) return e(t, n);
  Jl = !0;
  try {
    return Jg(e, t, n);
  } finally {
    Jl = !1, (Fo !== null || Mo !== null) && (Zg(), Qg());
  }
}
function Zi(e, t) {
  var n = e.stateNode;
  if (n === null) return null;
  var r = Du(n);
  if (r === null) return null;
  n = r[t];
  e: switch (t) {
    case "onClick":
    case "onClickCapture":
    case "onDoubleClick":
    case "onDoubleClickCapture":
    case "onMouseDown":
    case "onMouseDownCapture":
    case "onMouseMove":
    case "onMouseMoveCapture":
    case "onMouseUp":
    case "onMouseUpCapture":
    case "onMouseEnter":
      (r = !r.disabled) || (e = e.type, r = !(e === "button" || e === "input" || e === "select" || e === "textarea")), e = !r;
      break e;
    default:
      e = !1;
  }
  if (e) return null;
  if (n && typeof n != "function") throw Error(W(231, t, typeof n));
  return n;
}
var nd = !1;
if (Tn) try {
  var fi = {};
  Object.defineProperty(fi, "passive", { get: function() {
    nd = !0;
  } }), window.addEventListener("test", fi, fi), window.removeEventListener("test", fi, fi);
} catch {
  nd = !1;
}
function zx(e, t, n, r, o, i, s, a, u) {
  var c = Array.prototype.slice.call(arguments, 3);
  try {
    t.apply(n, c);
  } catch (d) {
    this.onError(d);
  }
}
var zi = !1, tu = null, nu = !1, rd = null, Bx = { onError: function(e) {
  zi = !0, tu = e;
} };
function Ux(e, t, n, r, o, i, s, a, u) {
  zi = !1, tu = null, zx.apply(Bx, arguments);
}
function Wx(e, t, n, r, o, i, s, a, u) {
  if (Ux.apply(this, arguments), zi) {
    if (zi) {
      var c = tu;
      zi = !1, tu = null;
    } else throw Error(W(198));
    nu || (nu = !0, rd = c);
  }
}
function Or(e) {
  var t = e, n = e;
  if (e.alternate) for (; t.return; ) t = t.return;
  else {
    e = t;
    do
      t = e, t.flags & 4098 && (n = t.return), e = t.return;
    while (e);
  }
  return t.tag === 3 ? n : null;
}
function ey(e) {
  if (e.tag === 13) {
    var t = e.memoizedState;
    if (t === null && (e = e.alternate, e !== null && (t = e.memoizedState)), t !== null) return t.dehydrated;
  }
  return null;
}
function Xp(e) {
  if (Or(e) !== e) throw Error(W(188));
}
function qx(e) {
  var t = e.alternate;
  if (!t) {
    if (t = Or(e), t === null) throw Error(W(188));
    return t !== e ? null : e;
  }
  for (var n = e, r = t; ; ) {
    var o = n.return;
    if (o === null) break;
    var i = o.alternate;
    if (i === null) {
      if (r = o.return, r !== null) {
        n = r;
        continue;
      }
      break;
    }
    if (o.child === i.child) {
      for (i = o.child; i; ) {
        if (i === n) return Xp(o), e;
        if (i === r) return Xp(o), t;
        i = i.sibling;
      }
      throw Error(W(188));
    }
    if (n.return !== r.return) n = o, r = i;
    else {
      for (var s = !1, a = o.child; a; ) {
        if (a === n) {
          s = !0, n = o, r = i;
          break;
        }
        if (a === r) {
          s = !0, r = o, n = i;
          break;
        }
        a = a.sibling;
      }
      if (!s) {
        for (a = i.child; a; ) {
          if (a === n) {
            s = !0, n = i, r = o;
            break;
          }
          if (a === r) {
            s = !0, r = i, n = o;
            break;
          }
          a = a.sibling;
        }
        if (!s) throw Error(W(189));
      }
    }
    if (n.alternate !== r) throw Error(W(190));
  }
  if (n.tag !== 3) throw Error(W(188));
  return n.stateNode.current === n ? e : t;
}
function ty(e) {
  return e = qx(e), e !== null ? ny(e) : null;
}
function ny(e) {
  if (e.tag === 5 || e.tag === 6) return e;
  for (e = e.child; e !== null; ) {
    var t = ny(e);
    if (t !== null) return t;
    e = e.sibling;
  }
  return null;
}
var ry = St.unstable_scheduleCallback, eh = St.unstable_cancelCallback, Hx = St.unstable_shouldYield, Kx = St.unstable_requestPaint, Ie = St.unstable_now, Gx = St.unstable_getCurrentPriorityLevel, Mf = St.unstable_ImmediatePriority, oy = St.unstable_UserBlockingPriority, ru = St.unstable_NormalPriority, Yx = St.unstable_LowPriority, iy = St.unstable_IdlePriority, Au = null, cn = null;
function Qx(e) {
  if (cn && typeof cn.onCommitFiberRoot == "function") try {
    cn.onCommitFiberRoot(Au, e, void 0, (e.current.flags & 128) === 128);
  } catch {
  }
}
var qt = Math.clz32 ? Math.clz32 : Xx, Jx = Math.log, Zx = Math.LN2;
function Xx(e) {
  return e >>>= 0, e === 0 ? 32 : 31 - (Jx(e) / Zx | 0) | 0;
}
var Qs = 64, Js = 4194304;
function _i(e) {
  switch (e & -e) {
    case 1:
      return 1;
    case 2:
      return 2;
    case 4:
      return 4;
    case 8:
      return 8;
    case 16:
      return 16;
    case 32:
      return 32;
    case 64:
    case 128:
    case 256:
    case 512:
    case 1024:
    case 2048:
    case 4096:
    case 8192:
    case 16384:
    case 32768:
    case 65536:
    case 131072:
    case 262144:
    case 524288:
    case 1048576:
    case 2097152:
      return e & 4194240;
    case 4194304:
    case 8388608:
    case 16777216:
    case 33554432:
    case 67108864:
      return e & 130023424;
    case 134217728:
      return 134217728;
    case 268435456:
      return 268435456;
    case 536870912:
      return 536870912;
    case 1073741824:
      return 1073741824;
    default:
      return e;
  }
}
function ou(e, t) {
  var n = e.pendingLanes;
  if (n === 0) return 0;
  var r = 0, o = e.suspendedLanes, i = e.pingedLanes, s = n & 268435455;
  if (s !== 0) {
    var a = s & ~o;
    a !== 0 ? r = _i(a) : (i &= s, i !== 0 && (r = _i(i)));
  } else s = n & ~o, s !== 0 ? r = _i(s) : i !== 0 && (r = _i(i));
  if (r === 0) return 0;
  if (t !== 0 && t !== r && !(t & o) && (o = r & -r, i = t & -t, o >= i || o === 16 && (i & 4194240) !== 0)) return t;
  if (r & 4 && (r |= n & 16), t = e.entangledLanes, t !== 0) for (e = e.entanglements, t &= r; 0 < t; ) n = 31 - qt(t), o = 1 << n, r |= e[n], t &= ~o;
  return r;
}
function eC(e, t) {
  switch (e) {
    case 1:
    case 2:
    case 4:
      return t + 250;
    case 8:
    case 16:
    case 32:
    case 64:
    case 128:
    case 256:
    case 512:
    case 1024:
    case 2048:
    case 4096:
    case 8192:
    case 16384:
    case 32768:
    case 65536:
    case 131072:
    case 262144:
    case 524288:
    case 1048576:
    case 2097152:
      return t + 5e3;
    case 4194304:
    case 8388608:
    case 16777216:
    case 33554432:
    case 67108864:
      return -1;
    case 134217728:
    case 268435456:
    case 536870912:
    case 1073741824:
      return -1;
    default:
      return -1;
  }
}
function tC(e, t) {
  for (var n = e.suspendedLanes, r = e.pingedLanes, o = e.expirationTimes, i = e.pendingLanes; 0 < i; ) {
    var s = 31 - qt(i), a = 1 << s, u = o[s];
    u === -1 ? (!(a & n) || a & r) && (o[s] = eC(a, t)) : u <= t && (e.expiredLanes |= a), i &= ~a;
  }
}
function od(e) {
  return e = e.pendingLanes & -1073741825, e !== 0 ? e : e & 1073741824 ? 1073741824 : 0;
}
function sy() {
  var e = Qs;
  return Qs <<= 1, !(Qs & 4194240) && (Qs = 64), e;
}
function Zl(e) {
  for (var t = [], n = 0; 31 > n; n++) t.push(e);
  return t;
}
function ws(e, t, n) {
  e.pendingLanes |= t, t !== 536870912 && (e.suspendedLanes = 0, e.pingedLanes = 0), e = e.eventTimes, t = 31 - qt(t), e[t] = n;
}
function nC(e, t) {
  var n = e.pendingLanes & ~t;
  e.pendingLanes = t, e.suspendedLanes = 0, e.pingedLanes = 0, e.expiredLanes &= t, e.mutableReadLanes &= t, e.entangledLanes &= t, t = e.entanglements;
  var r = e.eventTimes;
  for (e = e.expirationTimes; 0 < n; ) {
    var o = 31 - qt(n), i = 1 << o;
    t[o] = 0, r[o] = -1, e[o] = -1, n &= ~i;
  }
}
function Nf(e, t) {
  var n = e.entangledLanes |= t;
  for (e = e.entanglements; n; ) {
    var r = 31 - qt(n), o = 1 << r;
    o & t | e[r] & t && (e[r] |= t), n &= ~o;
  }
}
var ce = 0;
function ay(e) {
  return e &= -e, 1 < e ? 4 < e ? e & 268435455 ? 16 : 536870912 : 4 : 1;
}
var uy, $f, ly, cy, dy, id = !1, Zs = [], Zn = null, Xn = null, er = null, Xi = /* @__PURE__ */ new Map(), es = /* @__PURE__ */ new Map(), Gn = [], rC = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset submit".split(" ");
function th(e, t) {
  switch (e) {
    case "focusin":
    case "focusout":
      Zn = null;
      break;
    case "dragenter":
    case "dragleave":
      Xn = null;
      break;
    case "mouseover":
    case "mouseout":
      er = null;
      break;
    case "pointerover":
    case "pointerout":
      Xi.delete(t.pointerId);
      break;
    case "gotpointercapture":
    case "lostpointercapture":
      es.delete(t.pointerId);
  }
}
function mi(e, t, n, r, o, i) {
  return e === null || e.nativeEvent !== i ? (e = { blockedOn: t, domEventName: n, eventSystemFlags: r, nativeEvent: i, targetContainers: [o] }, t !== null && (t = xs(t), t !== null && $f(t)), e) : (e.eventSystemFlags |= r, t = e.targetContainers, o !== null && t.indexOf(o) === -1 && t.push(o), e);
}
function oC(e, t, n, r, o) {
  switch (t) {
    case "focusin":
      return Zn = mi(Zn, e, t, n, r, o), !0;
    case "dragenter":
      return Xn = mi(Xn, e, t, n, r, o), !0;
    case "mouseover":
      return er = mi(er, e, t, n, r, o), !0;
    case "pointerover":
      var i = o.pointerId;
      return Xi.set(i, mi(Xi.get(i) || null, e, t, n, r, o)), !0;
    case "gotpointercapture":
      return i = o.pointerId, es.set(i, mi(es.get(i) || null, e, t, n, r, o)), !0;
  }
  return !1;
}
function fy(e) {
  var t = Sr(e.target);
  if (t !== null) {
    var n = Or(t);
    if (n !== null) {
      if (t = n.tag, t === 13) {
        if (t = ey(n), t !== null) {
          e.blockedOn = t, dy(e.priority, function() {
            ly(n);
          });
          return;
        }
      } else if (t === 3 && n.stateNode.current.memoizedState.isDehydrated) {
        e.blockedOn = n.tag === 3 ? n.stateNode.containerInfo : null;
        return;
      }
    }
  }
  e.blockedOn = null;
}
function Aa(e) {
  if (e.blockedOn !== null) return !1;
  for (var t = e.targetContainers; 0 < t.length; ) {
    var n = sd(e.domEventName, e.eventSystemFlags, t[0], e.nativeEvent);
    if (n === null) {
      n = e.nativeEvent;
      var r = new n.constructor(n.type, n);
      ed = r, n.target.dispatchEvent(r), ed = null;
    } else return t = xs(n), t !== null && $f(t), e.blockedOn = n, !1;
    t.shift();
  }
  return !0;
}
function nh(e, t, n) {
  Aa(e) && n.delete(t);
}
function iC() {
  id = !1, Zn !== null && Aa(Zn) && (Zn = null), Xn !== null && Aa(Xn) && (Xn = null), er !== null && Aa(er) && (er = null), Xi.forEach(nh), es.forEach(nh);
}
function pi(e, t) {
  e.blockedOn === t && (e.blockedOn = null, id || (id = !0, St.unstable_scheduleCallback(St.unstable_NormalPriority, iC)));
}
function ts(e) {
  function t(o) {
    return pi(o, e);
  }
  if (0 < Zs.length) {
    pi(Zs[0], e);
    for (var n = 1; n < Zs.length; n++) {
      var r = Zs[n];
      r.blockedOn === e && (r.blockedOn = null);
    }
  }
  for (Zn !== null && pi(Zn, e), Xn !== null && pi(Xn, e), er !== null && pi(er, e), Xi.forEach(t), es.forEach(t), n = 0; n < Gn.length; n++) r = Gn[n], r.blockedOn === e && (r.blockedOn = null);
  for (; 0 < Gn.length && (n = Gn[0], n.blockedOn === null); ) fy(n), n.blockedOn === null && Gn.shift();
}
var No = Nn.ReactCurrentBatchConfig, iu = !0;
function sC(e, t, n, r) {
  var o = ce, i = No.transition;
  No.transition = null;
  try {
    ce = 1, _f(e, t, n, r);
  } finally {
    ce = o, No.transition = i;
  }
}
function aC(e, t, n, r) {
  var o = ce, i = No.transition;
  No.transition = null;
  try {
    ce = 4, _f(e, t, n, r);
  } finally {
    ce = o, No.transition = i;
  }
}
function _f(e, t, n, r) {
  if (iu) {
    var o = sd(e, t, n, r);
    if (o === null) uc(e, t, r, su, n), th(e, r);
    else if (oC(o, e, t, n, r)) r.stopPropagation();
    else if (th(e, r), t & 4 && -1 < rC.indexOf(e)) {
      for (; o !== null; ) {
        var i = xs(o);
        if (i !== null && uy(i), i = sd(e, t, n, r), i === null && uc(e, t, r, su, n), i === o) break;
        o = i;
      }
      o !== null && r.stopPropagation();
    } else uc(e, t, r, null, n);
  }
}
var su = null;
function sd(e, t, n, r) {
  if (su = null, e = Ff(r), e = Sr(e), e !== null) if (t = Or(e), t === null) e = null;
  else if (n = t.tag, n === 13) {
    if (e = ey(t), e !== null) return e;
    e = null;
  } else if (n === 3) {
    if (t.stateNode.current.memoizedState.isDehydrated) return t.tag === 3 ? t.stateNode.containerInfo : null;
    e = null;
  } else t !== e && (e = null);
  return su = e, null;
}
function my(e) {
  switch (e) {
    case "cancel":
    case "click":
    case "close":
    case "contextmenu":
    case "copy":
    case "cut":
    case "auxclick":
    case "dblclick":
    case "dragend":
    case "dragstart":
    case "drop":
    case "focusin":
    case "focusout":
    case "input":
    case "invalid":
    case "keydown":
    case "keypress":
    case "keyup":
    case "mousedown":
    case "mouseup":
    case "paste":
    case "pause":
    case "play":
    case "pointercancel":
    case "pointerdown":
    case "pointerup":
    case "ratechange":
    case "reset":
    case "resize":
    case "seeked":
    case "submit":
    case "touchcancel":
    case "touchend":
    case "touchstart":
    case "volumechange":
    case "change":
    case "selectionchange":
    case "textInput":
    case "compositionstart":
    case "compositionend":
    case "compositionupdate":
    case "beforeblur":
    case "afterblur":
    case "beforeinput":
    case "blur":
    case "fullscreenchange":
    case "focus":
    case "hashchange":
    case "popstate":
    case "select":
    case "selectstart":
      return 1;
    case "drag":
    case "dragenter":
    case "dragexit":
    case "dragleave":
    case "dragover":
    case "mousemove":
    case "mouseout":
    case "mouseover":
    case "pointermove":
    case "pointerout":
    case "pointerover":
    case "scroll":
    case "toggle":
    case "touchmove":
    case "wheel":
    case "mouseenter":
    case "mouseleave":
    case "pointerenter":
    case "pointerleave":
      return 4;
    case "message":
      switch (Gx()) {
        case Mf:
          return 1;
        case oy:
          return 4;
        case ru:
        case Yx:
          return 16;
        case iy:
          return 536870912;
        default:
          return 16;
      }
    default:
      return 16;
  }
}
var Qn = null, Af = null, La = null;
function py() {
  if (La) return La;
  var e, t = Af, n = t.length, r, o = "value" in Qn ? Qn.value : Qn.textContent, i = o.length;
  for (e = 0; e < n && t[e] === o[e]; e++) ;
  var s = n - e;
  for (r = 1; r <= s && t[n - r] === o[i - r]; r++) ;
  return La = o.slice(e, 1 < r ? 1 - r : void 0);
}
function Oa(e) {
  var t = e.keyCode;
  return "charCode" in e ? (e = e.charCode, e === 0 && t === 13 && (e = 13)) : e = t, e === 10 && (e = 13), 32 <= e || e === 13 ? e : 0;
}
function Xs() {
  return !0;
}
function rh() {
  return !1;
}
function Ct(e) {
  function t(n, r, o, i, s) {
    this._reactName = n, this._targetInst = o, this.type = r, this.nativeEvent = i, this.target = s, this.currentTarget = null;
    for (var a in e) e.hasOwnProperty(a) && (n = e[a], this[a] = n ? n(i) : i[a]);
    return this.isDefaultPrevented = (i.defaultPrevented != null ? i.defaultPrevented : i.returnValue === !1) ? Xs : rh, this.isPropagationStopped = rh, this;
  }
  return Ce(t.prototype, { preventDefault: function() {
    this.defaultPrevented = !0;
    var n = this.nativeEvent;
    n && (n.preventDefault ? n.preventDefault() : typeof n.returnValue != "unknown" && (n.returnValue = !1), this.isDefaultPrevented = Xs);
  }, stopPropagation: function() {
    var n = this.nativeEvent;
    n && (n.stopPropagation ? n.stopPropagation() : typeof n.cancelBubble != "unknown" && (n.cancelBubble = !0), this.isPropagationStopped = Xs);
  }, persist: function() {
  }, isPersistent: Xs }), t;
}
var Qo = { eventPhase: 0, bubbles: 0, cancelable: 0, timeStamp: function(e) {
  return e.timeStamp || Date.now();
}, defaultPrevented: 0, isTrusted: 0 }, Lf = Ct(Qo), Ss = Ce({}, Qo, { view: 0, detail: 0 }), uC = Ct(Ss), Xl, ec, hi, Lu = Ce({}, Ss, { screenX: 0, screenY: 0, clientX: 0, clientY: 0, pageX: 0, pageY: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, getModifierState: Of, button: 0, buttons: 0, relatedTarget: function(e) {
  return e.relatedTarget === void 0 ? e.fromElement === e.srcElement ? e.toElement : e.fromElement : e.relatedTarget;
}, movementX: function(e) {
  return "movementX" in e ? e.movementX : (e !== hi && (hi && e.type === "mousemove" ? (Xl = e.screenX - hi.screenX, ec = e.screenY - hi.screenY) : ec = Xl = 0, hi = e), Xl);
}, movementY: function(e) {
  return "movementY" in e ? e.movementY : ec;
} }), oh = Ct(Lu), lC = Ce({}, Lu, { dataTransfer: 0 }), cC = Ct(lC), dC = Ce({}, Ss, { relatedTarget: 0 }), tc = Ct(dC), fC = Ce({}, Qo, { animationName: 0, elapsedTime: 0, pseudoElement: 0 }), mC = Ct(fC), pC = Ce({}, Qo, { clipboardData: function(e) {
  return "clipboardData" in e ? e.clipboardData : window.clipboardData;
} }), hC = Ct(pC), vC = Ce({}, Qo, { data: 0 }), ih = Ct(vC), gC = {
  Esc: "Escape",
  Spacebar: " ",
  Left: "ArrowLeft",
  Up: "ArrowUp",
  Right: "ArrowRight",
  Down: "ArrowDown",
  Del: "Delete",
  Win: "OS",
  Menu: "ContextMenu",
  Apps: "ContextMenu",
  Scroll: "ScrollLock",
  MozPrintableKey: "Unidentified"
}, yC = {
  8: "Backspace",
  9: "Tab",
  12: "Clear",
  13: "Enter",
  16: "Shift",
  17: "Control",
  18: "Alt",
  19: "Pause",
  20: "CapsLock",
  27: "Escape",
  32: " ",
  33: "PageUp",
  34: "PageDown",
  35: "End",
  36: "Home",
  37: "ArrowLeft",
  38: "ArrowUp",
  39: "ArrowRight",
  40: "ArrowDown",
  45: "Insert",
  46: "Delete",
  112: "F1",
  113: "F2",
  114: "F3",
  115: "F4",
  116: "F5",
  117: "F6",
  118: "F7",
  119: "F8",
  120: "F9",
  121: "F10",
  122: "F11",
  123: "F12",
  144: "NumLock",
  145: "ScrollLock",
  224: "Meta"
}, wC = { Alt: "altKey", Control: "ctrlKey", Meta: "metaKey", Shift: "shiftKey" };
function SC(e) {
  var t = this.nativeEvent;
  return t.getModifierState ? t.getModifierState(e) : (e = wC[e]) ? !!t[e] : !1;
}
function Of() {
  return SC;
}
var xC = Ce({}, Ss, { key: function(e) {
  if (e.key) {
    var t = gC[e.key] || e.key;
    if (t !== "Unidentified") return t;
  }
  return e.type === "keypress" ? (e = Oa(e), e === 13 ? "Enter" : String.fromCharCode(e)) : e.type === "keydown" || e.type === "keyup" ? yC[e.keyCode] || "Unidentified" : "";
}, code: 0, location: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, repeat: 0, locale: 0, getModifierState: Of, charCode: function(e) {
  return e.type === "keypress" ? Oa(e) : 0;
}, keyCode: function(e) {
  return e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
}, which: function(e) {
  return e.type === "keypress" ? Oa(e) : e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
} }), CC = Ct(xC), bC = Ce({}, Lu, { pointerId: 0, width: 0, height: 0, pressure: 0, tangentialPressure: 0, tiltX: 0, tiltY: 0, twist: 0, pointerType: 0, isPrimary: 0 }), sh = Ct(bC), EC = Ce({}, Ss, { touches: 0, targetTouches: 0, changedTouches: 0, altKey: 0, metaKey: 0, ctrlKey: 0, shiftKey: 0, getModifierState: Of }), kC = Ct(EC), PC = Ce({}, Qo, { propertyName: 0, elapsedTime: 0, pseudoElement: 0 }), IC = Ct(PC), TC = Ce({}, Lu, {
  deltaX: function(e) {
    return "deltaX" in e ? e.deltaX : "wheelDeltaX" in e ? -e.wheelDeltaX : 0;
  },
  deltaY: function(e) {
    return "deltaY" in e ? e.deltaY : "wheelDeltaY" in e ? -e.wheelDeltaY : "wheelDelta" in e ? -e.wheelDelta : 0;
  },
  deltaZ: 0,
  deltaMode: 0
}), RC = Ct(TC), FC = [9, 13, 27, 32], jf = Tn && "CompositionEvent" in window, Bi = null;
Tn && "documentMode" in document && (Bi = document.documentMode);
var MC = Tn && "TextEvent" in window && !Bi, hy = Tn && (!jf || Bi && 8 < Bi && 11 >= Bi), ah = " ", uh = !1;
function vy(e, t) {
  switch (e) {
    case "keyup":
      return FC.indexOf(t.keyCode) !== -1;
    case "keydown":
      return t.keyCode !== 229;
    case "keypress":
    case "mousedown":
    case "focusout":
      return !0;
    default:
      return !1;
  }
}
function gy(e) {
  return e = e.detail, typeof e == "object" && "data" in e ? e.data : null;
}
var ho = !1;
function NC(e, t) {
  switch (e) {
    case "compositionend":
      return gy(t);
    case "keypress":
      return t.which !== 32 ? null : (uh = !0, ah);
    case "textInput":
      return e = t.data, e === ah && uh ? null : e;
    default:
      return null;
  }
}
function $C(e, t) {
  if (ho) return e === "compositionend" || !jf && vy(e, t) ? (e = py(), La = Af = Qn = null, ho = !1, e) : null;
  switch (e) {
    case "paste":
      return null;
    case "keypress":
      if (!(t.ctrlKey || t.altKey || t.metaKey) || t.ctrlKey && t.altKey) {
        if (t.char && 1 < t.char.length) return t.char;
        if (t.which) return String.fromCharCode(t.which);
      }
      return null;
    case "compositionend":
      return hy && t.locale !== "ko" ? null : t.data;
    default:
      return null;
  }
}
var _C = { color: !0, date: !0, datetime: !0, "datetime-local": !0, email: !0, month: !0, number: !0, password: !0, range: !0, search: !0, tel: !0, text: !0, time: !0, url: !0, week: !0 };
function lh(e) {
  var t = e && e.nodeName && e.nodeName.toLowerCase();
  return t === "input" ? !!_C[e.type] : t === "textarea";
}
function yy(e, t, n, r) {
  Yg(r), t = au(t, "onChange"), 0 < t.length && (n = new Lf("onChange", "change", null, n, r), e.push({ event: n, listeners: t }));
}
var Ui = null, ns = null;
function AC(e) {
  Ry(e, 0);
}
function Ou(e) {
  var t = yo(e);
  if (Bg(t)) return e;
}
function LC(e, t) {
  if (e === "change") return t;
}
var wy = !1;
if (Tn) {
  var nc;
  if (Tn) {
    var rc = "oninput" in document;
    if (!rc) {
      var ch = document.createElement("div");
      ch.setAttribute("oninput", "return;"), rc = typeof ch.oninput == "function";
    }
    nc = rc;
  } else nc = !1;
  wy = nc && (!document.documentMode || 9 < document.documentMode);
}
function dh() {
  Ui && (Ui.detachEvent("onpropertychange", Sy), ns = Ui = null);
}
function Sy(e) {
  if (e.propertyName === "value" && Ou(ns)) {
    var t = [];
    yy(t, ns, e, Ff(e)), Xg(AC, t);
  }
}
function OC(e, t, n) {
  e === "focusin" ? (dh(), Ui = t, ns = n, Ui.attachEvent("onpropertychange", Sy)) : e === "focusout" && dh();
}
function jC(e) {
  if (e === "selectionchange" || e === "keyup" || e === "keydown") return Ou(ns);
}
function DC(e, t) {
  if (e === "click") return Ou(t);
}
function VC(e, t) {
  if (e === "input" || e === "change") return Ou(t);
}
function zC(e, t) {
  return e === t && (e !== 0 || 1 / e === 1 / t) || e !== e && t !== t;
}
var Kt = typeof Object.is == "function" ? Object.is : zC;
function rs(e, t) {
  if (Kt(e, t)) return !0;
  if (typeof e != "object" || e === null || typeof t != "object" || t === null) return !1;
  var n = Object.keys(e), r = Object.keys(t);
  if (n.length !== r.length) return !1;
  for (r = 0; r < n.length; r++) {
    var o = n[r];
    if (!Bc.call(t, o) || !Kt(e[o], t[o])) return !1;
  }
  return !0;
}
function fh(e) {
  for (; e && e.firstChild; ) e = e.firstChild;
  return e;
}
function mh(e, t) {
  var n = fh(e);
  e = 0;
  for (var r; n; ) {
    if (n.nodeType === 3) {
      if (r = e + n.textContent.length, e <= t && r >= t) return { node: n, offset: t - e };
      e = r;
    }
    e: {
      for (; n; ) {
        if (n.nextSibling) {
          n = n.nextSibling;
          break e;
        }
        n = n.parentNode;
      }
      n = void 0;
    }
    n = fh(n);
  }
}
function xy(e, t) {
  return e && t ? e === t ? !0 : e && e.nodeType === 3 ? !1 : t && t.nodeType === 3 ? xy(e, t.parentNode) : "contains" in e ? e.contains(t) : e.compareDocumentPosition ? !!(e.compareDocumentPosition(t) & 16) : !1 : !1;
}
function Cy() {
  for (var e = window, t = eu(); t instanceof e.HTMLIFrameElement; ) {
    try {
      var n = typeof t.contentWindow.location.href == "string";
    } catch {
      n = !1;
    }
    if (n) e = t.contentWindow;
    else break;
    t = eu(e.document);
  }
  return t;
}
function Df(e) {
  var t = e && e.nodeName && e.nodeName.toLowerCase();
  return t && (t === "input" && (e.type === "text" || e.type === "search" || e.type === "tel" || e.type === "url" || e.type === "password") || t === "textarea" || e.contentEditable === "true");
}
function BC(e) {
  var t = Cy(), n = e.focusedElem, r = e.selectionRange;
  if (t !== n && n && n.ownerDocument && xy(n.ownerDocument.documentElement, n)) {
    if (r !== null && Df(n)) {
      if (t = r.start, e = r.end, e === void 0 && (e = t), "selectionStart" in n) n.selectionStart = t, n.selectionEnd = Math.min(e, n.value.length);
      else if (e = (t = n.ownerDocument || document) && t.defaultView || window, e.getSelection) {
        e = e.getSelection();
        var o = n.textContent.length, i = Math.min(r.start, o);
        r = r.end === void 0 ? i : Math.min(r.end, o), !e.extend && i > r && (o = r, r = i, i = o), o = mh(n, i);
        var s = mh(
          n,
          r
        );
        o && s && (e.rangeCount !== 1 || e.anchorNode !== o.node || e.anchorOffset !== o.offset || e.focusNode !== s.node || e.focusOffset !== s.offset) && (t = t.createRange(), t.setStart(o.node, o.offset), e.removeAllRanges(), i > r ? (e.addRange(t), e.extend(s.node, s.offset)) : (t.setEnd(s.node, s.offset), e.addRange(t)));
      }
    }
    for (t = [], e = n; e = e.parentNode; ) e.nodeType === 1 && t.push({ element: e, left: e.scrollLeft, top: e.scrollTop });
    for (typeof n.focus == "function" && n.focus(), n = 0; n < t.length; n++) e = t[n], e.element.scrollLeft = e.left, e.element.scrollTop = e.top;
  }
}
var UC = Tn && "documentMode" in document && 11 >= document.documentMode, vo = null, ad = null, Wi = null, ud = !1;
function ph(e, t, n) {
  var r = n.window === n ? n.document : n.nodeType === 9 ? n : n.ownerDocument;
  ud || vo == null || vo !== eu(r) || (r = vo, "selectionStart" in r && Df(r) ? r = { start: r.selectionStart, end: r.selectionEnd } : (r = (r.ownerDocument && r.ownerDocument.defaultView || window).getSelection(), r = { anchorNode: r.anchorNode, anchorOffset: r.anchorOffset, focusNode: r.focusNode, focusOffset: r.focusOffset }), Wi && rs(Wi, r) || (Wi = r, r = au(ad, "onSelect"), 0 < r.length && (t = new Lf("onSelect", "select", null, t, n), e.push({ event: t, listeners: r }), t.target = vo)));
}
function ea(e, t) {
  var n = {};
  return n[e.toLowerCase()] = t.toLowerCase(), n["Webkit" + e] = "webkit" + t, n["Moz" + e] = "moz" + t, n;
}
var go = { animationend: ea("Animation", "AnimationEnd"), animationiteration: ea("Animation", "AnimationIteration"), animationstart: ea("Animation", "AnimationStart"), transitionend: ea("Transition", "TransitionEnd") }, oc = {}, by = {};
Tn && (by = document.createElement("div").style, "AnimationEvent" in window || (delete go.animationend.animation, delete go.animationiteration.animation, delete go.animationstart.animation), "TransitionEvent" in window || delete go.transitionend.transition);
function ju(e) {
  if (oc[e]) return oc[e];
  if (!go[e]) return e;
  var t = go[e], n;
  for (n in t) if (t.hasOwnProperty(n) && n in by) return oc[e] = t[n];
  return e;
}
var Ey = ju("animationend"), ky = ju("animationiteration"), Py = ju("animationstart"), Iy = ju("transitionend"), Ty = /* @__PURE__ */ new Map(), hh = "abort auxClick cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
function lr(e, t) {
  Ty.set(e, t), Lr(t, [e]);
}
for (var ic = 0; ic < hh.length; ic++) {
  var sc = hh[ic], WC = sc.toLowerCase(), qC = sc[0].toUpperCase() + sc.slice(1);
  lr(WC, "on" + qC);
}
lr(Ey, "onAnimationEnd");
lr(ky, "onAnimationIteration");
lr(Py, "onAnimationStart");
lr("dblclick", "onDoubleClick");
lr("focusin", "onFocus");
lr("focusout", "onBlur");
lr(Iy, "onTransitionEnd");
Vo("onMouseEnter", ["mouseout", "mouseover"]);
Vo("onMouseLeave", ["mouseout", "mouseover"]);
Vo("onPointerEnter", ["pointerout", "pointerover"]);
Vo("onPointerLeave", ["pointerout", "pointerover"]);
Lr("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" "));
Lr("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" "));
Lr("onBeforeInput", ["compositionend", "keypress", "textInput", "paste"]);
Lr("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" "));
Lr("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" "));
Lr("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
var Ai = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "), HC = new Set("cancel close invalid load scroll toggle".split(" ").concat(Ai));
function vh(e, t, n) {
  var r = e.type || "unknown-event";
  e.currentTarget = n, Wx(r, t, void 0, e), e.currentTarget = null;
}
function Ry(e, t) {
  t = (t & 4) !== 0;
  for (var n = 0; n < e.length; n++) {
    var r = e[n], o = r.event;
    r = r.listeners;
    e: {
      var i = void 0;
      if (t) for (var s = r.length - 1; 0 <= s; s--) {
        var a = r[s], u = a.instance, c = a.currentTarget;
        if (a = a.listener, u !== i && o.isPropagationStopped()) break e;
        vh(o, a, c), i = u;
      }
      else for (s = 0; s < r.length; s++) {
        if (a = r[s], u = a.instance, c = a.currentTarget, a = a.listener, u !== i && o.isPropagationStopped()) break e;
        vh(o, a, c), i = u;
      }
    }
  }
  if (nu) throw e = rd, nu = !1, rd = null, e;
}
function he(e, t) {
  var n = t[md];
  n === void 0 && (n = t[md] = /* @__PURE__ */ new Set());
  var r = e + "__bubble";
  n.has(r) || (Fy(t, e, 2, !1), n.add(r));
}
function ac(e, t, n) {
  var r = 0;
  t && (r |= 4), Fy(n, e, r, t);
}
var ta = "_reactListening" + Math.random().toString(36).slice(2);
function os(e) {
  if (!e[ta]) {
    e[ta] = !0, Og.forEach(function(n) {
      n !== "selectionchange" && (HC.has(n) || ac(n, !1, e), ac(n, !0, e));
    });
    var t = e.nodeType === 9 ? e : e.ownerDocument;
    t === null || t[ta] || (t[ta] = !0, ac("selectionchange", !1, t));
  }
}
function Fy(e, t, n, r) {
  switch (my(t)) {
    case 1:
      var o = sC;
      break;
    case 4:
      o = aC;
      break;
    default:
      o = _f;
  }
  n = o.bind(null, t, n, e), o = void 0, !nd || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (o = !0), r ? o !== void 0 ? e.addEventListener(t, n, { capture: !0, passive: o }) : e.addEventListener(t, n, !0) : o !== void 0 ? e.addEventListener(t, n, { passive: o }) : e.addEventListener(t, n, !1);
}
function uc(e, t, n, r, o) {
  var i = r;
  if (!(t & 1) && !(t & 2) && r !== null) e: for (; ; ) {
    if (r === null) return;
    var s = r.tag;
    if (s === 3 || s === 4) {
      var a = r.stateNode.containerInfo;
      if (a === o || a.nodeType === 8 && a.parentNode === o) break;
      if (s === 4) for (s = r.return; s !== null; ) {
        var u = s.tag;
        if ((u === 3 || u === 4) && (u = s.stateNode.containerInfo, u === o || u.nodeType === 8 && u.parentNode === o)) return;
        s = s.return;
      }
      for (; a !== null; ) {
        if (s = Sr(a), s === null) return;
        if (u = s.tag, u === 5 || u === 6) {
          r = i = s;
          continue e;
        }
        a = a.parentNode;
      }
    }
    r = r.return;
  }
  Xg(function() {
    var c = i, d = Ff(n), m = [];
    e: {
      var f = Ty.get(e);
      if (f !== void 0) {
        var v = Lf, h = e;
        switch (e) {
          case "keypress":
            if (Oa(n) === 0) break e;
          case "keydown":
          case "keyup":
            v = CC;
            break;
          case "focusin":
            h = "focus", v = tc;
            break;
          case "focusout":
            h = "blur", v = tc;
            break;
          case "beforeblur":
          case "afterblur":
            v = tc;
            break;
          case "click":
            if (n.button === 2) break e;
          case "auxclick":
          case "dblclick":
          case "mousedown":
          case "mousemove":
          case "mouseup":
          case "mouseout":
          case "mouseover":
          case "contextmenu":
            v = oh;
            break;
          case "drag":
          case "dragend":
          case "dragenter":
          case "dragexit":
          case "dragleave":
          case "dragover":
          case "dragstart":
          case "drop":
            v = cC;
            break;
          case "touchcancel":
          case "touchend":
          case "touchmove":
          case "touchstart":
            v = kC;
            break;
          case Ey:
          case ky:
          case Py:
            v = mC;
            break;
          case Iy:
            v = IC;
            break;
          case "scroll":
            v = uC;
            break;
          case "wheel":
            v = RC;
            break;
          case "copy":
          case "cut":
          case "paste":
            v = hC;
            break;
          case "gotpointercapture":
          case "lostpointercapture":
          case "pointercancel":
          case "pointerdown":
          case "pointermove":
          case "pointerout":
          case "pointerover":
          case "pointerup":
            v = sh;
        }
        var w = (t & 4) !== 0, x = !w && e === "scroll", g = w ? f !== null ? f + "Capture" : null : f;
        w = [];
        for (var p = c, y; p !== null; ) {
          y = p;
          var C = y.stateNode;
          if (y.tag === 5 && C !== null && (y = C, g !== null && (C = Zi(p, g), C != null && w.push(is(p, C, y)))), x) break;
          p = p.return;
        }
        0 < w.length && (f = new v(f, h, null, n, d), m.push({ event: f, listeners: w }));
      }
    }
    if (!(t & 7)) {
      e: {
        if (f = e === "mouseover" || e === "pointerover", v = e === "mouseout" || e === "pointerout", f && n !== ed && (h = n.relatedTarget || n.fromElement) && (Sr(h) || h[Rn])) break e;
        if ((v || f) && (f = d.window === d ? d : (f = d.ownerDocument) ? f.defaultView || f.parentWindow : window, v ? (h = n.relatedTarget || n.toElement, v = c, h = h ? Sr(h) : null, h !== null && (x = Or(h), h !== x || h.tag !== 5 && h.tag !== 6) && (h = null)) : (v = null, h = c), v !== h)) {
          if (w = oh, C = "onMouseLeave", g = "onMouseEnter", p = "mouse", (e === "pointerout" || e === "pointerover") && (w = sh, C = "onPointerLeave", g = "onPointerEnter", p = "pointer"), x = v == null ? f : yo(v), y = h == null ? f : yo(h), f = new w(C, p + "leave", v, n, d), f.target = x, f.relatedTarget = y, C = null, Sr(d) === c && (w = new w(g, p + "enter", h, n, d), w.target = y, w.relatedTarget = x, C = w), x = C, v && h) t: {
            for (w = v, g = h, p = 0, y = w; y; y = io(y)) p++;
            for (y = 0, C = g; C; C = io(C)) y++;
            for (; 0 < p - y; ) w = io(w), p--;
            for (; 0 < y - p; ) g = io(g), y--;
            for (; p--; ) {
              if (w === g || g !== null && w === g.alternate) break t;
              w = io(w), g = io(g);
            }
            w = null;
          }
          else w = null;
          v !== null && gh(m, f, v, w, !1), h !== null && x !== null && gh(m, x, h, w, !0);
        }
      }
      e: {
        if (f = c ? yo(c) : window, v = f.nodeName && f.nodeName.toLowerCase(), v === "select" || v === "input" && f.type === "file") var b = LC;
        else if (lh(f)) if (wy) b = VC;
        else {
          b = jC;
          var E = OC;
        }
        else (v = f.nodeName) && v.toLowerCase() === "input" && (f.type === "checkbox" || f.type === "radio") && (b = DC);
        if (b && (b = b(e, c))) {
          yy(m, b, n, d);
          break e;
        }
        E && E(e, f, c), e === "focusout" && (E = f._wrapperState) && E.controlled && f.type === "number" && Yc(f, "number", f.value);
      }
      switch (E = c ? yo(c) : window, e) {
        case "focusin":
          (lh(E) || E.contentEditable === "true") && (vo = E, ad = c, Wi = null);
          break;
        case "focusout":
          Wi = ad = vo = null;
          break;
        case "mousedown":
          ud = !0;
          break;
        case "contextmenu":
        case "mouseup":
        case "dragend":
          ud = !1, ph(m, n, d);
          break;
        case "selectionchange":
          if (UC) break;
        case "keydown":
        case "keyup":
          ph(m, n, d);
      }
      var k;
      if (jf) e: {
        switch (e) {
          case "compositionstart":
            var P = "onCompositionStart";
            break e;
          case "compositionend":
            P = "onCompositionEnd";
            break e;
          case "compositionupdate":
            P = "onCompositionUpdate";
            break e;
        }
        P = void 0;
      }
      else ho ? vy(e, n) && (P = "onCompositionEnd") : e === "keydown" && n.keyCode === 229 && (P = "onCompositionStart");
      P && (hy && n.locale !== "ko" && (ho || P !== "onCompositionStart" ? P === "onCompositionEnd" && ho && (k = py()) : (Qn = d, Af = "value" in Qn ? Qn.value : Qn.textContent, ho = !0)), E = au(c, P), 0 < E.length && (P = new ih(P, e, null, n, d), m.push({ event: P, listeners: E }), k ? P.data = k : (k = gy(n), k !== null && (P.data = k)))), (k = MC ? NC(e, n) : $C(e, n)) && (c = au(c, "onBeforeInput"), 0 < c.length && (d = new ih("onBeforeInput", "beforeinput", null, n, d), m.push({ event: d, listeners: c }), d.data = k));
    }
    Ry(m, t);
  });
}
function is(e, t, n) {
  return { instance: e, listener: t, currentTarget: n };
}
function au(e, t) {
  for (var n = t + "Capture", r = []; e !== null; ) {
    var o = e, i = o.stateNode;
    o.tag === 5 && i !== null && (o = i, i = Zi(e, n), i != null && r.unshift(is(e, i, o)), i = Zi(e, t), i != null && r.push(is(e, i, o))), e = e.return;
  }
  return r;
}
function io(e) {
  if (e === null) return null;
  do
    e = e.return;
  while (e && e.tag !== 5);
  return e || null;
}
function gh(e, t, n, r, o) {
  for (var i = t._reactName, s = []; n !== null && n !== r; ) {
    var a = n, u = a.alternate, c = a.stateNode;
    if (u !== null && u === r) break;
    a.tag === 5 && c !== null && (a = c, o ? (u = Zi(n, i), u != null && s.unshift(is(n, u, a))) : o || (u = Zi(n, i), u != null && s.push(is(n, u, a)))), n = n.return;
  }
  s.length !== 0 && e.push({ event: t, listeners: s });
}
var KC = /\r\n?/g, GC = /\u0000|\uFFFD/g;
function yh(e) {
  return (typeof e == "string" ? e : "" + e).replace(KC, `
`).replace(GC, "");
}
function na(e, t, n) {
  if (t = yh(t), yh(e) !== t && n) throw Error(W(425));
}
function uu() {
}
var ld = null, cd = null;
function dd(e, t) {
  return e === "textarea" || e === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
}
var fd = typeof setTimeout == "function" ? setTimeout : void 0, YC = typeof clearTimeout == "function" ? clearTimeout : void 0, wh = typeof Promise == "function" ? Promise : void 0, QC = typeof queueMicrotask == "function" ? queueMicrotask : typeof wh < "u" ? function(e) {
  return wh.resolve(null).then(e).catch(JC);
} : fd;
function JC(e) {
  setTimeout(function() {
    throw e;
  });
}
function lc(e, t) {
  var n = t, r = 0;
  do {
    var o = n.nextSibling;
    if (e.removeChild(n), o && o.nodeType === 8) if (n = o.data, n === "/$") {
      if (r === 0) {
        e.removeChild(o), ts(t);
        return;
      }
      r--;
    } else n !== "$" && n !== "$?" && n !== "$!" || r++;
    n = o;
  } while (n);
  ts(t);
}
function tr(e) {
  for (; e != null; e = e.nextSibling) {
    var t = e.nodeType;
    if (t === 1 || t === 3) break;
    if (t === 8) {
      if (t = e.data, t === "$" || t === "$!" || t === "$?") break;
      if (t === "/$") return null;
    }
  }
  return e;
}
function Sh(e) {
  e = e.previousSibling;
  for (var t = 0; e; ) {
    if (e.nodeType === 8) {
      var n = e.data;
      if (n === "$" || n === "$!" || n === "$?") {
        if (t === 0) return e;
        t--;
      } else n === "/$" && t++;
    }
    e = e.previousSibling;
  }
  return null;
}
var Jo = Math.random().toString(36).slice(2), un = "__reactFiber$" + Jo, ss = "__reactProps$" + Jo, Rn = "__reactContainer$" + Jo, md = "__reactEvents$" + Jo, ZC = "__reactListeners$" + Jo, XC = "__reactHandles$" + Jo;
function Sr(e) {
  var t = e[un];
  if (t) return t;
  for (var n = e.parentNode; n; ) {
    if (t = n[Rn] || n[un]) {
      if (n = t.alternate, t.child !== null || n !== null && n.child !== null) for (e = Sh(e); e !== null; ) {
        if (n = e[un]) return n;
        e = Sh(e);
      }
      return t;
    }
    e = n, n = e.parentNode;
  }
  return null;
}
function xs(e) {
  return e = e[un] || e[Rn], !e || e.tag !== 5 && e.tag !== 6 && e.tag !== 13 && e.tag !== 3 ? null : e;
}
function yo(e) {
  if (e.tag === 5 || e.tag === 6) return e.stateNode;
  throw Error(W(33));
}
function Du(e) {
  return e[ss] || null;
}
var pd = [], wo = -1;
function cr(e) {
  return { current: e };
}
function ve(e) {
  0 > wo || (e.current = pd[wo], pd[wo] = null, wo--);
}
function me(e, t) {
  wo++, pd[wo] = e.current, e.current = t;
}
var ur = {}, Ye = cr(ur), ct = cr(!1), Tr = ur;
function zo(e, t) {
  var n = e.type.contextTypes;
  if (!n) return ur;
  var r = e.stateNode;
  if (r && r.__reactInternalMemoizedUnmaskedChildContext === t) return r.__reactInternalMemoizedMaskedChildContext;
  var o = {}, i;
  for (i in n) o[i] = t[i];
  return r && (e = e.stateNode, e.__reactInternalMemoizedUnmaskedChildContext = t, e.__reactInternalMemoizedMaskedChildContext = o), o;
}
function dt(e) {
  return e = e.childContextTypes, e != null;
}
function lu() {
  ve(ct), ve(Ye);
}
function xh(e, t, n) {
  if (Ye.current !== ur) throw Error(W(168));
  me(Ye, t), me(ct, n);
}
function My(e, t, n) {
  var r = e.stateNode;
  if (t = t.childContextTypes, typeof r.getChildContext != "function") return n;
  r = r.getChildContext();
  for (var o in r) if (!(o in t)) throw Error(W(108, Ox(e) || "Unknown", o));
  return Ce({}, n, r);
}
function cu(e) {
  return e = (e = e.stateNode) && e.__reactInternalMemoizedMergedChildContext || ur, Tr = Ye.current, me(Ye, e), me(ct, ct.current), !0;
}
function Ch(e, t, n) {
  var r = e.stateNode;
  if (!r) throw Error(W(169));
  n ? (e = My(e, t, Tr), r.__reactInternalMemoizedMergedChildContext = e, ve(ct), ve(Ye), me(Ye, e)) : ve(ct), me(ct, n);
}
var En = null, Vu = !1, cc = !1;
function Ny(e) {
  En === null ? En = [e] : En.push(e);
}
function eb(e) {
  Vu = !0, Ny(e);
}
function dr() {
  if (!cc && En !== null) {
    cc = !0;
    var e = 0, t = ce;
    try {
      var n = En;
      for (ce = 1; e < n.length; e++) {
        var r = n[e];
        do
          r = r(!0);
        while (r !== null);
      }
      En = null, Vu = !1;
    } catch (o) {
      throw En !== null && (En = En.slice(e + 1)), ry(Mf, dr), o;
    } finally {
      ce = t, cc = !1;
    }
  }
  return null;
}
var So = [], xo = 0, du = null, fu = 0, It = [], Tt = 0, Rr = null, kn = 1, Pn = "";
function yr(e, t) {
  So[xo++] = fu, So[xo++] = du, du = e, fu = t;
}
function $y(e, t, n) {
  It[Tt++] = kn, It[Tt++] = Pn, It[Tt++] = Rr, Rr = e;
  var r = kn;
  e = Pn;
  var o = 32 - qt(r) - 1;
  r &= ~(1 << o), n += 1;
  var i = 32 - qt(t) + o;
  if (30 < i) {
    var s = o - o % 5;
    i = (r & (1 << s) - 1).toString(32), r >>= s, o -= s, kn = 1 << 32 - qt(t) + o | n << o | r, Pn = i + e;
  } else kn = 1 << i | n << o | r, Pn = e;
}
function Vf(e) {
  e.return !== null && (yr(e, 1), $y(e, 1, 0));
}
function zf(e) {
  for (; e === du; ) du = So[--xo], So[xo] = null, fu = So[--xo], So[xo] = null;
  for (; e === Rr; ) Rr = It[--Tt], It[Tt] = null, Pn = It[--Tt], It[Tt] = null, kn = It[--Tt], It[Tt] = null;
}
var wt = null, yt = null, ye = !1, Wt = null;
function _y(e, t) {
  var n = Rt(5, null, null, 0);
  n.elementType = "DELETED", n.stateNode = t, n.return = e, t = e.deletions, t === null ? (e.deletions = [n], e.flags |= 16) : t.push(n);
}
function bh(e, t) {
  switch (e.tag) {
    case 5:
      var n = e.type;
      return t = t.nodeType !== 1 || n.toLowerCase() !== t.nodeName.toLowerCase() ? null : t, t !== null ? (e.stateNode = t, wt = e, yt = tr(t.firstChild), !0) : !1;
    case 6:
      return t = e.pendingProps === "" || t.nodeType !== 3 ? null : t, t !== null ? (e.stateNode = t, wt = e, yt = null, !0) : !1;
    case 13:
      return t = t.nodeType !== 8 ? null : t, t !== null ? (n = Rr !== null ? { id: kn, overflow: Pn } : null, e.memoizedState = { dehydrated: t, treeContext: n, retryLane: 1073741824 }, n = Rt(18, null, null, 0), n.stateNode = t, n.return = e, e.child = n, wt = e, yt = null, !0) : !1;
    default:
      return !1;
  }
}
function hd(e) {
  return (e.mode & 1) !== 0 && (e.flags & 128) === 0;
}
function vd(e) {
  if (ye) {
    var t = yt;
    if (t) {
      var n = t;
      if (!bh(e, t)) {
        if (hd(e)) throw Error(W(418));
        t = tr(n.nextSibling);
        var r = wt;
        t && bh(e, t) ? _y(r, n) : (e.flags = e.flags & -4097 | 2, ye = !1, wt = e);
      }
    } else {
      if (hd(e)) throw Error(W(418));
      e.flags = e.flags & -4097 | 2, ye = !1, wt = e;
    }
  }
}
function Eh(e) {
  for (e = e.return; e !== null && e.tag !== 5 && e.tag !== 3 && e.tag !== 13; ) e = e.return;
  wt = e;
}
function ra(e) {
  if (e !== wt) return !1;
  if (!ye) return Eh(e), ye = !0, !1;
  var t;
  if ((t = e.tag !== 3) && !(t = e.tag !== 5) && (t = e.type, t = t !== "head" && t !== "body" && !dd(e.type, e.memoizedProps)), t && (t = yt)) {
    if (hd(e)) throw Ay(), Error(W(418));
    for (; t; ) _y(e, t), t = tr(t.nextSibling);
  }
  if (Eh(e), e.tag === 13) {
    if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(W(317));
    e: {
      for (e = e.nextSibling, t = 0; e; ) {
        if (e.nodeType === 8) {
          var n = e.data;
          if (n === "/$") {
            if (t === 0) {
              yt = tr(e.nextSibling);
              break e;
            }
            t--;
          } else n !== "$" && n !== "$!" && n !== "$?" || t++;
        }
        e = e.nextSibling;
      }
      yt = null;
    }
  } else yt = wt ? tr(e.stateNode.nextSibling) : null;
  return !0;
}
function Ay() {
  for (var e = yt; e; ) e = tr(e.nextSibling);
}
function Bo() {
  yt = wt = null, ye = !1;
}
function Bf(e) {
  Wt === null ? Wt = [e] : Wt.push(e);
}
var tb = Nn.ReactCurrentBatchConfig;
function vi(e, t, n) {
  if (e = n.ref, e !== null && typeof e != "function" && typeof e != "object") {
    if (n._owner) {
      if (n = n._owner, n) {
        if (n.tag !== 1) throw Error(W(309));
        var r = n.stateNode;
      }
      if (!r) throw Error(W(147, e));
      var o = r, i = "" + e;
      return t !== null && t.ref !== null && typeof t.ref == "function" && t.ref._stringRef === i ? t.ref : (t = function(s) {
        var a = o.refs;
        s === null ? delete a[i] : a[i] = s;
      }, t._stringRef = i, t);
    }
    if (typeof e != "string") throw Error(W(284));
    if (!n._owner) throw Error(W(290, e));
  }
  return e;
}
function oa(e, t) {
  throw e = Object.prototype.toString.call(t), Error(W(31, e === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : e));
}
function kh(e) {
  var t = e._init;
  return t(e._payload);
}
function Ly(e) {
  function t(g, p) {
    if (e) {
      var y = g.deletions;
      y === null ? (g.deletions = [p], g.flags |= 16) : y.push(p);
    }
  }
  function n(g, p) {
    if (!e) return null;
    for (; p !== null; ) t(g, p), p = p.sibling;
    return null;
  }
  function r(g, p) {
    for (g = /* @__PURE__ */ new Map(); p !== null; ) p.key !== null ? g.set(p.key, p) : g.set(p.index, p), p = p.sibling;
    return g;
  }
  function o(g, p) {
    return g = ir(g, p), g.index = 0, g.sibling = null, g;
  }
  function i(g, p, y) {
    return g.index = y, e ? (y = g.alternate, y !== null ? (y = y.index, y < p ? (g.flags |= 2, p) : y) : (g.flags |= 2, p)) : (g.flags |= 1048576, p);
  }
  function s(g) {
    return e && g.alternate === null && (g.flags |= 2), g;
  }
  function a(g, p, y, C) {
    return p === null || p.tag !== 6 ? (p = gc(y, g.mode, C), p.return = g, p) : (p = o(p, y), p.return = g, p);
  }
  function u(g, p, y, C) {
    var b = y.type;
    return b === po ? d(g, p, y.props.children, C, y.key) : p !== null && (p.elementType === b || typeof b == "object" && b !== null && b.$$typeof === Hn && kh(b) === p.type) ? (C = o(p, y.props), C.ref = vi(g, p, y), C.return = g, C) : (C = Wa(y.type, y.key, y.props, null, g.mode, C), C.ref = vi(g, p, y), C.return = g, C);
  }
  function c(g, p, y, C) {
    return p === null || p.tag !== 4 || p.stateNode.containerInfo !== y.containerInfo || p.stateNode.implementation !== y.implementation ? (p = yc(y, g.mode, C), p.return = g, p) : (p = o(p, y.children || []), p.return = g, p);
  }
  function d(g, p, y, C, b) {
    return p === null || p.tag !== 7 ? (p = Ir(y, g.mode, C, b), p.return = g, p) : (p = o(p, y), p.return = g, p);
  }
  function m(g, p, y) {
    if (typeof p == "string" && p !== "" || typeof p == "number") return p = gc("" + p, g.mode, y), p.return = g, p;
    if (typeof p == "object" && p !== null) {
      switch (p.$$typeof) {
        case Ks:
          return y = Wa(p.type, p.key, p.props, null, g.mode, y), y.ref = vi(g, null, p), y.return = g, y;
        case mo:
          return p = yc(p, g.mode, y), p.return = g, p;
        case Hn:
          var C = p._init;
          return m(g, C(p._payload), y);
      }
      if ($i(p) || di(p)) return p = Ir(p, g.mode, y, null), p.return = g, p;
      oa(g, p);
    }
    return null;
  }
  function f(g, p, y, C) {
    var b = p !== null ? p.key : null;
    if (typeof y == "string" && y !== "" || typeof y == "number") return b !== null ? null : a(g, p, "" + y, C);
    if (typeof y == "object" && y !== null) {
      switch (y.$$typeof) {
        case Ks:
          return y.key === b ? u(g, p, y, C) : null;
        case mo:
          return y.key === b ? c(g, p, y, C) : null;
        case Hn:
          return b = y._init, f(
            g,
            p,
            b(y._payload),
            C
          );
      }
      if ($i(y) || di(y)) return b !== null ? null : d(g, p, y, C, null);
      oa(g, y);
    }
    return null;
  }
  function v(g, p, y, C, b) {
    if (typeof C == "string" && C !== "" || typeof C == "number") return g = g.get(y) || null, a(p, g, "" + C, b);
    if (typeof C == "object" && C !== null) {
      switch (C.$$typeof) {
        case Ks:
          return g = g.get(C.key === null ? y : C.key) || null, u(p, g, C, b);
        case mo:
          return g = g.get(C.key === null ? y : C.key) || null, c(p, g, C, b);
        case Hn:
          var E = C._init;
          return v(g, p, y, E(C._payload), b);
      }
      if ($i(C) || di(C)) return g = g.get(y) || null, d(p, g, C, b, null);
      oa(p, C);
    }
    return null;
  }
  function h(g, p, y, C) {
    for (var b = null, E = null, k = p, P = p = 0, F = null; k !== null && P < y.length; P++) {
      k.index > P ? (F = k, k = null) : F = k.sibling;
      var I = f(g, k, y[P], C);
      if (I === null) {
        k === null && (k = F);
        break;
      }
      e && k && I.alternate === null && t(g, k), p = i(I, p, P), E === null ? b = I : E.sibling = I, E = I, k = F;
    }
    if (P === y.length) return n(g, k), ye && yr(g, P), b;
    if (k === null) {
      for (; P < y.length; P++) k = m(g, y[P], C), k !== null && (p = i(k, p, P), E === null ? b = k : E.sibling = k, E = k);
      return ye && yr(g, P), b;
    }
    for (k = r(g, k); P < y.length; P++) F = v(k, g, P, y[P], C), F !== null && (e && F.alternate !== null && k.delete(F.key === null ? P : F.key), p = i(F, p, P), E === null ? b = F : E.sibling = F, E = F);
    return e && k.forEach(function(L) {
      return t(g, L);
    }), ye && yr(g, P), b;
  }
  function w(g, p, y, C) {
    var b = di(y);
    if (typeof b != "function") throw Error(W(150));
    if (y = b.call(y), y == null) throw Error(W(151));
    for (var E = b = null, k = p, P = p = 0, F = null, I = y.next(); k !== null && !I.done; P++, I = y.next()) {
      k.index > P ? (F = k, k = null) : F = k.sibling;
      var L = f(g, k, I.value, C);
      if (L === null) {
        k === null && (k = F);
        break;
      }
      e && k && L.alternate === null && t(g, k), p = i(L, p, P), E === null ? b = L : E.sibling = L, E = L, k = F;
    }
    if (I.done) return n(
      g,
      k
    ), ye && yr(g, P), b;
    if (k === null) {
      for (; !I.done; P++, I = y.next()) I = m(g, I.value, C), I !== null && (p = i(I, p, P), E === null ? b = I : E.sibling = I, E = I);
      return ye && yr(g, P), b;
    }
    for (k = r(g, k); !I.done; P++, I = y.next()) I = v(k, g, P, I.value, C), I !== null && (e && I.alternate !== null && k.delete(I.key === null ? P : I.key), p = i(I, p, P), E === null ? b = I : E.sibling = I, E = I);
    return e && k.forEach(function(_) {
      return t(g, _);
    }), ye && yr(g, P), b;
  }
  function x(g, p, y, C) {
    if (typeof y == "object" && y !== null && y.type === po && y.key === null && (y = y.props.children), typeof y == "object" && y !== null) {
      switch (y.$$typeof) {
        case Ks:
          e: {
            for (var b = y.key, E = p; E !== null; ) {
              if (E.key === b) {
                if (b = y.type, b === po) {
                  if (E.tag === 7) {
                    n(g, E.sibling), p = o(E, y.props.children), p.return = g, g = p;
                    break e;
                  }
                } else if (E.elementType === b || typeof b == "object" && b !== null && b.$$typeof === Hn && kh(b) === E.type) {
                  n(g, E.sibling), p = o(E, y.props), p.ref = vi(g, E, y), p.return = g, g = p;
                  break e;
                }
                n(g, E);
                break;
              } else t(g, E);
              E = E.sibling;
            }
            y.type === po ? (p = Ir(y.props.children, g.mode, C, y.key), p.return = g, g = p) : (C = Wa(y.type, y.key, y.props, null, g.mode, C), C.ref = vi(g, p, y), C.return = g, g = C);
          }
          return s(g);
        case mo:
          e: {
            for (E = y.key; p !== null; ) {
              if (p.key === E) if (p.tag === 4 && p.stateNode.containerInfo === y.containerInfo && p.stateNode.implementation === y.implementation) {
                n(g, p.sibling), p = o(p, y.children || []), p.return = g, g = p;
                break e;
              } else {
                n(g, p);
                break;
              }
              else t(g, p);
              p = p.sibling;
            }
            p = yc(y, g.mode, C), p.return = g, g = p;
          }
          return s(g);
        case Hn:
          return E = y._init, x(g, p, E(y._payload), C);
      }
      if ($i(y)) return h(g, p, y, C);
      if (di(y)) return w(g, p, y, C);
      oa(g, y);
    }
    return typeof y == "string" && y !== "" || typeof y == "number" ? (y = "" + y, p !== null && p.tag === 6 ? (n(g, p.sibling), p = o(p, y), p.return = g, g = p) : (n(g, p), p = gc(y, g.mode, C), p.return = g, g = p), s(g)) : n(g, p);
  }
  return x;
}
var Uo = Ly(!0), Oy = Ly(!1), mu = cr(null), pu = null, Co = null, Uf = null;
function Wf() {
  Uf = Co = pu = null;
}
function qf(e) {
  var t = mu.current;
  ve(mu), e._currentValue = t;
}
function gd(e, t, n) {
  for (; e !== null; ) {
    var r = e.alternate;
    if ((e.childLanes & t) !== t ? (e.childLanes |= t, r !== null && (r.childLanes |= t)) : r !== null && (r.childLanes & t) !== t && (r.childLanes |= t), e === n) break;
    e = e.return;
  }
}
function $o(e, t) {
  pu = e, Uf = Co = null, e = e.dependencies, e !== null && e.firstContext !== null && (e.lanes & t && (lt = !0), e.firstContext = null);
}
function Mt(e) {
  var t = e._currentValue;
  if (Uf !== e) if (e = { context: e, memoizedValue: t, next: null }, Co === null) {
    if (pu === null) throw Error(W(308));
    Co = e, pu.dependencies = { lanes: 0, firstContext: e };
  } else Co = Co.next = e;
  return t;
}
var xr = null;
function Hf(e) {
  xr === null ? xr = [e] : xr.push(e);
}
function jy(e, t, n, r) {
  var o = t.interleaved;
  return o === null ? (n.next = n, Hf(t)) : (n.next = o.next, o.next = n), t.interleaved = n, Fn(e, r);
}
function Fn(e, t) {
  e.lanes |= t;
  var n = e.alternate;
  for (n !== null && (n.lanes |= t), n = e, e = e.return; e !== null; ) e.childLanes |= t, n = e.alternate, n !== null && (n.childLanes |= t), n = e, e = e.return;
  return n.tag === 3 ? n.stateNode : null;
}
var Kn = !1;
function Kf(e) {
  e.updateQueue = { baseState: e.memoizedState, firstBaseUpdate: null, lastBaseUpdate: null, shared: { pending: null, interleaved: null, lanes: 0 }, effects: null };
}
function Dy(e, t) {
  e = e.updateQueue, t.updateQueue === e && (t.updateQueue = { baseState: e.baseState, firstBaseUpdate: e.firstBaseUpdate, lastBaseUpdate: e.lastBaseUpdate, shared: e.shared, effects: e.effects });
}
function In(e, t) {
  return { eventTime: e, lane: t, tag: 0, payload: null, callback: null, next: null };
}
function nr(e, t, n) {
  var r = e.updateQueue;
  if (r === null) return null;
  if (r = r.shared, se & 2) {
    var o = r.pending;
    return o === null ? t.next = t : (t.next = o.next, o.next = t), r.pending = t, Fn(e, n);
  }
  return o = r.interleaved, o === null ? (t.next = t, Hf(r)) : (t.next = o.next, o.next = t), r.interleaved = t, Fn(e, n);
}
function ja(e, t, n) {
  if (t = t.updateQueue, t !== null && (t = t.shared, (n & 4194240) !== 0)) {
    var r = t.lanes;
    r &= e.pendingLanes, n |= r, t.lanes = n, Nf(e, n);
  }
}
function Ph(e, t) {
  var n = e.updateQueue, r = e.alternate;
  if (r !== null && (r = r.updateQueue, n === r)) {
    var o = null, i = null;
    if (n = n.firstBaseUpdate, n !== null) {
      do {
        var s = { eventTime: n.eventTime, lane: n.lane, tag: n.tag, payload: n.payload, callback: n.callback, next: null };
        i === null ? o = i = s : i = i.next = s, n = n.next;
      } while (n !== null);
      i === null ? o = i = t : i = i.next = t;
    } else o = i = t;
    n = { baseState: r.baseState, firstBaseUpdate: o, lastBaseUpdate: i, shared: r.shared, effects: r.effects }, e.updateQueue = n;
    return;
  }
  e = n.lastBaseUpdate, e === null ? n.firstBaseUpdate = t : e.next = t, n.lastBaseUpdate = t;
}
function hu(e, t, n, r) {
  var o = e.updateQueue;
  Kn = !1;
  var i = o.firstBaseUpdate, s = o.lastBaseUpdate, a = o.shared.pending;
  if (a !== null) {
    o.shared.pending = null;
    var u = a, c = u.next;
    u.next = null, s === null ? i = c : s.next = c, s = u;
    var d = e.alternate;
    d !== null && (d = d.updateQueue, a = d.lastBaseUpdate, a !== s && (a === null ? d.firstBaseUpdate = c : a.next = c, d.lastBaseUpdate = u));
  }
  if (i !== null) {
    var m = o.baseState;
    s = 0, d = c = u = null, a = i;
    do {
      var f = a.lane, v = a.eventTime;
      if ((r & f) === f) {
        d !== null && (d = d.next = {
          eventTime: v,
          lane: 0,
          tag: a.tag,
          payload: a.payload,
          callback: a.callback,
          next: null
        });
        e: {
          var h = e, w = a;
          switch (f = t, v = n, w.tag) {
            case 1:
              if (h = w.payload, typeof h == "function") {
                m = h.call(v, m, f);
                break e;
              }
              m = h;
              break e;
            case 3:
              h.flags = h.flags & -65537 | 128;
            case 0:
              if (h = w.payload, f = typeof h == "function" ? h.call(v, m, f) : h, f == null) break e;
              m = Ce({}, m, f);
              break e;
            case 2:
              Kn = !0;
          }
        }
        a.callback !== null && a.lane !== 0 && (e.flags |= 64, f = o.effects, f === null ? o.effects = [a] : f.push(a));
      } else v = { eventTime: v, lane: f, tag: a.tag, payload: a.payload, callback: a.callback, next: null }, d === null ? (c = d = v, u = m) : d = d.next = v, s |= f;
      if (a = a.next, a === null) {
        if (a = o.shared.pending, a === null) break;
        f = a, a = f.next, f.next = null, o.lastBaseUpdate = f, o.shared.pending = null;
      }
    } while (!0);
    if (d === null && (u = m), o.baseState = u, o.firstBaseUpdate = c, o.lastBaseUpdate = d, t = o.shared.interleaved, t !== null) {
      o = t;
      do
        s |= o.lane, o = o.next;
      while (o !== t);
    } else i === null && (o.shared.lanes = 0);
    Mr |= s, e.lanes = s, e.memoizedState = m;
  }
}
function Ih(e, t, n) {
  if (e = t.effects, t.effects = null, e !== null) for (t = 0; t < e.length; t++) {
    var r = e[t], o = r.callback;
    if (o !== null) {
      if (r.callback = null, r = n, typeof o != "function") throw Error(W(191, o));
      o.call(r);
    }
  }
}
var Cs = {}, dn = cr(Cs), as = cr(Cs), us = cr(Cs);
function Cr(e) {
  if (e === Cs) throw Error(W(174));
  return e;
}
function Gf(e, t) {
  switch (me(us, t), me(as, e), me(dn, Cs), e = t.nodeType, e) {
    case 9:
    case 11:
      t = (t = t.documentElement) ? t.namespaceURI : Jc(null, "");
      break;
    default:
      e = e === 8 ? t.parentNode : t, t = e.namespaceURI || null, e = e.tagName, t = Jc(t, e);
  }
  ve(dn), me(dn, t);
}
function Wo() {
  ve(dn), ve(as), ve(us);
}
function Vy(e) {
  Cr(us.current);
  var t = Cr(dn.current), n = Jc(t, e.type);
  t !== n && (me(as, e), me(dn, n));
}
function Yf(e) {
  as.current === e && (ve(dn), ve(as));
}
var Se = cr(0);
function vu(e) {
  for (var t = e; t !== null; ) {
    if (t.tag === 13) {
      var n = t.memoizedState;
      if (n !== null && (n = n.dehydrated, n === null || n.data === "$?" || n.data === "$!")) return t;
    } else if (t.tag === 19 && t.memoizedProps.revealOrder !== void 0) {
      if (t.flags & 128) return t;
    } else if (t.child !== null) {
      t.child.return = t, t = t.child;
      continue;
    }
    if (t === e) break;
    for (; t.sibling === null; ) {
      if (t.return === null || t.return === e) return null;
      t = t.return;
    }
    t.sibling.return = t.return, t = t.sibling;
  }
  return null;
}
var dc = [];
function Qf() {
  for (var e = 0; e < dc.length; e++) dc[e]._workInProgressVersionPrimary = null;
  dc.length = 0;
}
var Da = Nn.ReactCurrentDispatcher, fc = Nn.ReactCurrentBatchConfig, Fr = 0, xe = null, Me = null, _e = null, gu = !1, qi = !1, ls = 0, nb = 0;
function qe() {
  throw Error(W(321));
}
function Jf(e, t) {
  if (t === null) return !1;
  for (var n = 0; n < t.length && n < e.length; n++) if (!Kt(e[n], t[n])) return !1;
  return !0;
}
function Zf(e, t, n, r, o, i) {
  if (Fr = i, xe = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, Da.current = e === null || e.memoizedState === null ? sb : ab, e = n(r, o), qi) {
    i = 0;
    do {
      if (qi = !1, ls = 0, 25 <= i) throw Error(W(301));
      i += 1, _e = Me = null, t.updateQueue = null, Da.current = ub, e = n(r, o);
    } while (qi);
  }
  if (Da.current = yu, t = Me !== null && Me.next !== null, Fr = 0, _e = Me = xe = null, gu = !1, t) throw Error(W(300));
  return e;
}
function Xf() {
  var e = ls !== 0;
  return ls = 0, e;
}
function an() {
  var e = { memoizedState: null, baseState: null, baseQueue: null, queue: null, next: null };
  return _e === null ? xe.memoizedState = _e = e : _e = _e.next = e, _e;
}
function Nt() {
  if (Me === null) {
    var e = xe.alternate;
    e = e !== null ? e.memoizedState : null;
  } else e = Me.next;
  var t = _e === null ? xe.memoizedState : _e.next;
  if (t !== null) _e = t, Me = e;
  else {
    if (e === null) throw Error(W(310));
    Me = e, e = { memoizedState: Me.memoizedState, baseState: Me.baseState, baseQueue: Me.baseQueue, queue: Me.queue, next: null }, _e === null ? xe.memoizedState = _e = e : _e = _e.next = e;
  }
  return _e;
}
function cs(e, t) {
  return typeof t == "function" ? t(e) : t;
}
function mc(e) {
  var t = Nt(), n = t.queue;
  if (n === null) throw Error(W(311));
  n.lastRenderedReducer = e;
  var r = Me, o = r.baseQueue, i = n.pending;
  if (i !== null) {
    if (o !== null) {
      var s = o.next;
      o.next = i.next, i.next = s;
    }
    r.baseQueue = o = i, n.pending = null;
  }
  if (o !== null) {
    i = o.next, r = r.baseState;
    var a = s = null, u = null, c = i;
    do {
      var d = c.lane;
      if ((Fr & d) === d) u !== null && (u = u.next = { lane: 0, action: c.action, hasEagerState: c.hasEagerState, eagerState: c.eagerState, next: null }), r = c.hasEagerState ? c.eagerState : e(r, c.action);
      else {
        var m = {
          lane: d,
          action: c.action,
          hasEagerState: c.hasEagerState,
          eagerState: c.eagerState,
          next: null
        };
        u === null ? (a = u = m, s = r) : u = u.next = m, xe.lanes |= d, Mr |= d;
      }
      c = c.next;
    } while (c !== null && c !== i);
    u === null ? s = r : u.next = a, Kt(r, t.memoizedState) || (lt = !0), t.memoizedState = r, t.baseState = s, t.baseQueue = u, n.lastRenderedState = r;
  }
  if (e = n.interleaved, e !== null) {
    o = e;
    do
      i = o.lane, xe.lanes |= i, Mr |= i, o = o.next;
    while (o !== e);
  } else o === null && (n.lanes = 0);
  return [t.memoizedState, n.dispatch];
}
function pc(e) {
  var t = Nt(), n = t.queue;
  if (n === null) throw Error(W(311));
  n.lastRenderedReducer = e;
  var r = n.dispatch, o = n.pending, i = t.memoizedState;
  if (o !== null) {
    n.pending = null;
    var s = o = o.next;
    do
      i = e(i, s.action), s = s.next;
    while (s !== o);
    Kt(i, t.memoizedState) || (lt = !0), t.memoizedState = i, t.baseQueue === null && (t.baseState = i), n.lastRenderedState = i;
  }
  return [i, r];
}
function zy() {
}
function By(e, t) {
  var n = xe, r = Nt(), o = t(), i = !Kt(r.memoizedState, o);
  if (i && (r.memoizedState = o, lt = !0), r = r.queue, em(qy.bind(null, n, r, e), [e]), r.getSnapshot !== t || i || _e !== null && _e.memoizedState.tag & 1) {
    if (n.flags |= 2048, ds(9, Wy.bind(null, n, r, o, t), void 0, null), Ae === null) throw Error(W(349));
    Fr & 30 || Uy(n, t, o);
  }
  return o;
}
function Uy(e, t, n) {
  e.flags |= 16384, e = { getSnapshot: t, value: n }, t = xe.updateQueue, t === null ? (t = { lastEffect: null, stores: null }, xe.updateQueue = t, t.stores = [e]) : (n = t.stores, n === null ? t.stores = [e] : n.push(e));
}
function Wy(e, t, n, r) {
  t.value = n, t.getSnapshot = r, Hy(t) && Ky(e);
}
function qy(e, t, n) {
  return n(function() {
    Hy(t) && Ky(e);
  });
}
function Hy(e) {
  var t = e.getSnapshot;
  e = e.value;
  try {
    var n = t();
    return !Kt(e, n);
  } catch {
    return !0;
  }
}
function Ky(e) {
  var t = Fn(e, 1);
  t !== null && Ht(t, e, 1, -1);
}
function Th(e) {
  var t = an();
  return typeof e == "function" && (e = e()), t.memoizedState = t.baseState = e, e = { pending: null, interleaved: null, lanes: 0, dispatch: null, lastRenderedReducer: cs, lastRenderedState: e }, t.queue = e, e = e.dispatch = ib.bind(null, xe, e), [t.memoizedState, e];
}
function ds(e, t, n, r) {
  return e = { tag: e, create: t, destroy: n, deps: r, next: null }, t = xe.updateQueue, t === null ? (t = { lastEffect: null, stores: null }, xe.updateQueue = t, t.lastEffect = e.next = e) : (n = t.lastEffect, n === null ? t.lastEffect = e.next = e : (r = n.next, n.next = e, e.next = r, t.lastEffect = e)), e;
}
function Gy() {
  return Nt().memoizedState;
}
function Va(e, t, n, r) {
  var o = an();
  xe.flags |= e, o.memoizedState = ds(1 | t, n, void 0, r === void 0 ? null : r);
}
function zu(e, t, n, r) {
  var o = Nt();
  r = r === void 0 ? null : r;
  var i = void 0;
  if (Me !== null) {
    var s = Me.memoizedState;
    if (i = s.destroy, r !== null && Jf(r, s.deps)) {
      o.memoizedState = ds(t, n, i, r);
      return;
    }
  }
  xe.flags |= e, o.memoizedState = ds(1 | t, n, i, r);
}
function Rh(e, t) {
  return Va(8390656, 8, e, t);
}
function em(e, t) {
  return zu(2048, 8, e, t);
}
function Yy(e, t) {
  return zu(4, 2, e, t);
}
function Qy(e, t) {
  return zu(4, 4, e, t);
}
function Jy(e, t) {
  if (typeof t == "function") return e = e(), t(e), function() {
    t(null);
  };
  if (t != null) return e = e(), t.current = e, function() {
    t.current = null;
  };
}
function Zy(e, t, n) {
  return n = n != null ? n.concat([e]) : null, zu(4, 4, Jy.bind(null, t, e), n);
}
function tm() {
}
function Xy(e, t) {
  var n = Nt();
  t = t === void 0 ? null : t;
  var r = n.memoizedState;
  return r !== null && t !== null && Jf(t, r[1]) ? r[0] : (n.memoizedState = [e, t], e);
}
function ew(e, t) {
  var n = Nt();
  t = t === void 0 ? null : t;
  var r = n.memoizedState;
  return r !== null && t !== null && Jf(t, r[1]) ? r[0] : (e = e(), n.memoizedState = [e, t], e);
}
function tw(e, t, n) {
  return Fr & 21 ? (Kt(n, t) || (n = sy(), xe.lanes |= n, Mr |= n, e.baseState = !0), t) : (e.baseState && (e.baseState = !1, lt = !0), e.memoizedState = n);
}
function rb(e, t) {
  var n = ce;
  ce = n !== 0 && 4 > n ? n : 4, e(!0);
  var r = fc.transition;
  fc.transition = {};
  try {
    e(!1), t();
  } finally {
    ce = n, fc.transition = r;
  }
}
function nw() {
  return Nt().memoizedState;
}
function ob(e, t, n) {
  var r = or(e);
  if (n = { lane: r, action: n, hasEagerState: !1, eagerState: null, next: null }, rw(e)) ow(t, n);
  else if (n = jy(e, t, n, r), n !== null) {
    var o = et();
    Ht(n, e, r, o), iw(n, t, r);
  }
}
function ib(e, t, n) {
  var r = or(e), o = { lane: r, action: n, hasEagerState: !1, eagerState: null, next: null };
  if (rw(e)) ow(t, o);
  else {
    var i = e.alternate;
    if (e.lanes === 0 && (i === null || i.lanes === 0) && (i = t.lastRenderedReducer, i !== null)) try {
      var s = t.lastRenderedState, a = i(s, n);
      if (o.hasEagerState = !0, o.eagerState = a, Kt(a, s)) {
        var u = t.interleaved;
        u === null ? (o.next = o, Hf(t)) : (o.next = u.next, u.next = o), t.interleaved = o;
        return;
      }
    } catch {
    } finally {
    }
    n = jy(e, t, o, r), n !== null && (o = et(), Ht(n, e, r, o), iw(n, t, r));
  }
}
function rw(e) {
  var t = e.alternate;
  return e === xe || t !== null && t === xe;
}
function ow(e, t) {
  qi = gu = !0;
  var n = e.pending;
  n === null ? t.next = t : (t.next = n.next, n.next = t), e.pending = t;
}
function iw(e, t, n) {
  if (n & 4194240) {
    var r = t.lanes;
    r &= e.pendingLanes, n |= r, t.lanes = n, Nf(e, n);
  }
}
var yu = { readContext: Mt, useCallback: qe, useContext: qe, useEffect: qe, useImperativeHandle: qe, useInsertionEffect: qe, useLayoutEffect: qe, useMemo: qe, useReducer: qe, useRef: qe, useState: qe, useDebugValue: qe, useDeferredValue: qe, useTransition: qe, useMutableSource: qe, useSyncExternalStore: qe, useId: qe, unstable_isNewReconciler: !1 }, sb = { readContext: Mt, useCallback: function(e, t) {
  return an().memoizedState = [e, t === void 0 ? null : t], e;
}, useContext: Mt, useEffect: Rh, useImperativeHandle: function(e, t, n) {
  return n = n != null ? n.concat([e]) : null, Va(
    4194308,
    4,
    Jy.bind(null, t, e),
    n
  );
}, useLayoutEffect: function(e, t) {
  return Va(4194308, 4, e, t);
}, useInsertionEffect: function(e, t) {
  return Va(4, 2, e, t);
}, useMemo: function(e, t) {
  var n = an();
  return t = t === void 0 ? null : t, e = e(), n.memoizedState = [e, t], e;
}, useReducer: function(e, t, n) {
  var r = an();
  return t = n !== void 0 ? n(t) : t, r.memoizedState = r.baseState = t, e = { pending: null, interleaved: null, lanes: 0, dispatch: null, lastRenderedReducer: e, lastRenderedState: t }, r.queue = e, e = e.dispatch = ob.bind(null, xe, e), [r.memoizedState, e];
}, useRef: function(e) {
  var t = an();
  return e = { current: e }, t.memoizedState = e;
}, useState: Th, useDebugValue: tm, useDeferredValue: function(e) {
  return an().memoizedState = e;
}, useTransition: function() {
  var e = Th(!1), t = e[0];
  return e = rb.bind(null, e[1]), an().memoizedState = e, [t, e];
}, useMutableSource: function() {
}, useSyncExternalStore: function(e, t, n) {
  var r = xe, o = an();
  if (ye) {
    if (n === void 0) throw Error(W(407));
    n = n();
  } else {
    if (n = t(), Ae === null) throw Error(W(349));
    Fr & 30 || Uy(r, t, n);
  }
  o.memoizedState = n;
  var i = { value: n, getSnapshot: t };
  return o.queue = i, Rh(qy.bind(
    null,
    r,
    i,
    e
  ), [e]), r.flags |= 2048, ds(9, Wy.bind(null, r, i, n, t), void 0, null), n;
}, useId: function() {
  var e = an(), t = Ae.identifierPrefix;
  if (ye) {
    var n = Pn, r = kn;
    n = (r & ~(1 << 32 - qt(r) - 1)).toString(32) + n, t = ":" + t + "R" + n, n = ls++, 0 < n && (t += "H" + n.toString(32)), t += ":";
  } else n = nb++, t = ":" + t + "r" + n.toString(32) + ":";
  return e.memoizedState = t;
}, unstable_isNewReconciler: !1 }, ab = {
  readContext: Mt,
  useCallback: Xy,
  useContext: Mt,
  useEffect: em,
  useImperativeHandle: Zy,
  useInsertionEffect: Yy,
  useLayoutEffect: Qy,
  useMemo: ew,
  useReducer: mc,
  useRef: Gy,
  useState: function() {
    return mc(cs);
  },
  useDebugValue: tm,
  useDeferredValue: function(e) {
    var t = Nt();
    return tw(t, Me.memoizedState, e);
  },
  useTransition: function() {
    var e = mc(cs)[0], t = Nt().memoizedState;
    return [e, t];
  },
  useMutableSource: zy,
  useSyncExternalStore: By,
  useId: nw,
  unstable_isNewReconciler: !1
}, ub = { readContext: Mt, useCallback: Xy, useContext: Mt, useEffect: em, useImperativeHandle: Zy, useInsertionEffect: Yy, useLayoutEffect: Qy, useMemo: ew, useReducer: pc, useRef: Gy, useState: function() {
  return pc(cs);
}, useDebugValue: tm, useDeferredValue: function(e) {
  var t = Nt();
  return Me === null ? t.memoizedState = e : tw(t, Me.memoizedState, e);
}, useTransition: function() {
  var e = pc(cs)[0], t = Nt().memoizedState;
  return [e, t];
}, useMutableSource: zy, useSyncExternalStore: By, useId: nw, unstable_isNewReconciler: !1 };
function Bt(e, t) {
  if (e && e.defaultProps) {
    t = Ce({}, t), e = e.defaultProps;
    for (var n in e) t[n] === void 0 && (t[n] = e[n]);
    return t;
  }
  return t;
}
function yd(e, t, n, r) {
  t = e.memoizedState, n = n(r, t), n = n == null ? t : Ce({}, t, n), e.memoizedState = n, e.lanes === 0 && (e.updateQueue.baseState = n);
}
var Bu = { isMounted: function(e) {
  return (e = e._reactInternals) ? Or(e) === e : !1;
}, enqueueSetState: function(e, t, n) {
  e = e._reactInternals;
  var r = et(), o = or(e), i = In(r, o);
  i.payload = t, n != null && (i.callback = n), t = nr(e, i, o), t !== null && (Ht(t, e, o, r), ja(t, e, o));
}, enqueueReplaceState: function(e, t, n) {
  e = e._reactInternals;
  var r = et(), o = or(e), i = In(r, o);
  i.tag = 1, i.payload = t, n != null && (i.callback = n), t = nr(e, i, o), t !== null && (Ht(t, e, o, r), ja(t, e, o));
}, enqueueForceUpdate: function(e, t) {
  e = e._reactInternals;
  var n = et(), r = or(e), o = In(n, r);
  o.tag = 2, t != null && (o.callback = t), t = nr(e, o, r), t !== null && (Ht(t, e, r, n), ja(t, e, r));
} };
function Fh(e, t, n, r, o, i, s) {
  return e = e.stateNode, typeof e.shouldComponentUpdate == "function" ? e.shouldComponentUpdate(r, i, s) : t.prototype && t.prototype.isPureReactComponent ? !rs(n, r) || !rs(o, i) : !0;
}
function sw(e, t, n) {
  var r = !1, o = ur, i = t.contextType;
  return typeof i == "object" && i !== null ? i = Mt(i) : (o = dt(t) ? Tr : Ye.current, r = t.contextTypes, i = (r = r != null) ? zo(e, o) : ur), t = new t(n, i), e.memoizedState = t.state !== null && t.state !== void 0 ? t.state : null, t.updater = Bu, e.stateNode = t, t._reactInternals = e, r && (e = e.stateNode, e.__reactInternalMemoizedUnmaskedChildContext = o, e.__reactInternalMemoizedMaskedChildContext = i), t;
}
function Mh(e, t, n, r) {
  e = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(n, r), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(n, r), t.state !== e && Bu.enqueueReplaceState(t, t.state, null);
}
function wd(e, t, n, r) {
  var o = e.stateNode;
  o.props = n, o.state = e.memoizedState, o.refs = {}, Kf(e);
  var i = t.contextType;
  typeof i == "object" && i !== null ? o.context = Mt(i) : (i = dt(t) ? Tr : Ye.current, o.context = zo(e, i)), o.state = e.memoizedState, i = t.getDerivedStateFromProps, typeof i == "function" && (yd(e, t, i, n), o.state = e.memoizedState), typeof t.getDerivedStateFromProps == "function" || typeof o.getSnapshotBeforeUpdate == "function" || typeof o.UNSAFE_componentWillMount != "function" && typeof o.componentWillMount != "function" || (t = o.state, typeof o.componentWillMount == "function" && o.componentWillMount(), typeof o.UNSAFE_componentWillMount == "function" && o.UNSAFE_componentWillMount(), t !== o.state && Bu.enqueueReplaceState(o, o.state, null), hu(e, n, o, r), o.state = e.memoizedState), typeof o.componentDidMount == "function" && (e.flags |= 4194308);
}
function qo(e, t) {
  try {
    var n = "", r = t;
    do
      n += Lx(r), r = r.return;
    while (r);
    var o = n;
  } catch (i) {
    o = `
Error generating stack: ` + i.message + `
` + i.stack;
  }
  return { value: e, source: t, stack: o, digest: null };
}
function hc(e, t, n) {
  return { value: e, source: null, stack: n ?? null, digest: t ?? null };
}
function Sd(e, t) {
  try {
    console.error(t.value);
  } catch (n) {
    setTimeout(function() {
      throw n;
    });
  }
}
var lb = typeof WeakMap == "function" ? WeakMap : Map;
function aw(e, t, n) {
  n = In(-1, n), n.tag = 3, n.payload = { element: null };
  var r = t.value;
  return n.callback = function() {
    Su || (Su = !0, Fd = r), Sd(e, t);
  }, n;
}
function uw(e, t, n) {
  n = In(-1, n), n.tag = 3;
  var r = e.type.getDerivedStateFromError;
  if (typeof r == "function") {
    var o = t.value;
    n.payload = function() {
      return r(o);
    }, n.callback = function() {
      Sd(e, t);
    };
  }
  var i = e.stateNode;
  return i !== null && typeof i.componentDidCatch == "function" && (n.callback = function() {
    Sd(e, t), typeof r != "function" && (rr === null ? rr = /* @__PURE__ */ new Set([this]) : rr.add(this));
    var s = t.stack;
    this.componentDidCatch(t.value, { componentStack: s !== null ? s : "" });
  }), n;
}
function Nh(e, t, n) {
  var r = e.pingCache;
  if (r === null) {
    r = e.pingCache = new lb();
    var o = /* @__PURE__ */ new Set();
    r.set(t, o);
  } else o = r.get(t), o === void 0 && (o = /* @__PURE__ */ new Set(), r.set(t, o));
  o.has(n) || (o.add(n), e = bb.bind(null, e, t, n), t.then(e, e));
}
function $h(e) {
  do {
    var t;
    if ((t = e.tag === 13) && (t = e.memoizedState, t = t !== null ? t.dehydrated !== null : !0), t) return e;
    e = e.return;
  } while (e !== null);
  return null;
}
function _h(e, t, n, r, o) {
  return e.mode & 1 ? (e.flags |= 65536, e.lanes = o, e) : (e === t ? e.flags |= 65536 : (e.flags |= 128, n.flags |= 131072, n.flags &= -52805, n.tag === 1 && (n.alternate === null ? n.tag = 17 : (t = In(-1, 1), t.tag = 2, nr(n, t, 1))), n.lanes |= 1), e);
}
var cb = Nn.ReactCurrentOwner, lt = !1;
function Xe(e, t, n, r) {
  t.child = e === null ? Oy(t, null, n, r) : Uo(t, e.child, n, r);
}
function Ah(e, t, n, r, o) {
  n = n.render;
  var i = t.ref;
  return $o(t, o), r = Zf(e, t, n, r, i, o), n = Xf(), e !== null && !lt ? (t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~o, Mn(e, t, o)) : (ye && n && Vf(t), t.flags |= 1, Xe(e, t, r, o), t.child);
}
function Lh(e, t, n, r, o) {
  if (e === null) {
    var i = n.type;
    return typeof i == "function" && !lm(i) && i.defaultProps === void 0 && n.compare === null && n.defaultProps === void 0 ? (t.tag = 15, t.type = i, lw(e, t, i, r, o)) : (e = Wa(n.type, null, r, t, t.mode, o), e.ref = t.ref, e.return = t, t.child = e);
  }
  if (i = e.child, !(e.lanes & o)) {
    var s = i.memoizedProps;
    if (n = n.compare, n = n !== null ? n : rs, n(s, r) && e.ref === t.ref) return Mn(e, t, o);
  }
  return t.flags |= 1, e = ir(i, r), e.ref = t.ref, e.return = t, t.child = e;
}
function lw(e, t, n, r, o) {
  if (e !== null) {
    var i = e.memoizedProps;
    if (rs(i, r) && e.ref === t.ref) if (lt = !1, t.pendingProps = r = i, (e.lanes & o) !== 0) e.flags & 131072 && (lt = !0);
    else return t.lanes = e.lanes, Mn(e, t, o);
  }
  return xd(e, t, n, r, o);
}
function cw(e, t, n) {
  var r = t.pendingProps, o = r.children, i = e !== null ? e.memoizedState : null;
  if (r.mode === "hidden") if (!(t.mode & 1)) t.memoizedState = { baseLanes: 0, cachePool: null, transitions: null }, me(Eo, gt), gt |= n;
  else {
    if (!(n & 1073741824)) return e = i !== null ? i.baseLanes | n : n, t.lanes = t.childLanes = 1073741824, t.memoizedState = { baseLanes: e, cachePool: null, transitions: null }, t.updateQueue = null, me(Eo, gt), gt |= e, null;
    t.memoizedState = { baseLanes: 0, cachePool: null, transitions: null }, r = i !== null ? i.baseLanes : n, me(Eo, gt), gt |= r;
  }
  else i !== null ? (r = i.baseLanes | n, t.memoizedState = null) : r = n, me(Eo, gt), gt |= r;
  return Xe(e, t, o, n), t.child;
}
function dw(e, t) {
  var n = t.ref;
  (e === null && n !== null || e !== null && e.ref !== n) && (t.flags |= 512, t.flags |= 2097152);
}
function xd(e, t, n, r, o) {
  var i = dt(n) ? Tr : Ye.current;
  return i = zo(t, i), $o(t, o), n = Zf(e, t, n, r, i, o), r = Xf(), e !== null && !lt ? (t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~o, Mn(e, t, o)) : (ye && r && Vf(t), t.flags |= 1, Xe(e, t, n, o), t.child);
}
function Oh(e, t, n, r, o) {
  if (dt(n)) {
    var i = !0;
    cu(t);
  } else i = !1;
  if ($o(t, o), t.stateNode === null) za(e, t), sw(t, n, r), wd(t, n, r, o), r = !0;
  else if (e === null) {
    var s = t.stateNode, a = t.memoizedProps;
    s.props = a;
    var u = s.context, c = n.contextType;
    typeof c == "object" && c !== null ? c = Mt(c) : (c = dt(n) ? Tr : Ye.current, c = zo(t, c));
    var d = n.getDerivedStateFromProps, m = typeof d == "function" || typeof s.getSnapshotBeforeUpdate == "function";
    m || typeof s.UNSAFE_componentWillReceiveProps != "function" && typeof s.componentWillReceiveProps != "function" || (a !== r || u !== c) && Mh(t, s, r, c), Kn = !1;
    var f = t.memoizedState;
    s.state = f, hu(t, r, s, o), u = t.memoizedState, a !== r || f !== u || ct.current || Kn ? (typeof d == "function" && (yd(t, n, d, r), u = t.memoizedState), (a = Kn || Fh(t, n, a, r, f, u, c)) ? (m || typeof s.UNSAFE_componentWillMount != "function" && typeof s.componentWillMount != "function" || (typeof s.componentWillMount == "function" && s.componentWillMount(), typeof s.UNSAFE_componentWillMount == "function" && s.UNSAFE_componentWillMount()), typeof s.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof s.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = r, t.memoizedState = u), s.props = r, s.state = u, s.context = c, r = a) : (typeof s.componentDidMount == "function" && (t.flags |= 4194308), r = !1);
  } else {
    s = t.stateNode, Dy(e, t), a = t.memoizedProps, c = t.type === t.elementType ? a : Bt(t.type, a), s.props = c, m = t.pendingProps, f = s.context, u = n.contextType, typeof u == "object" && u !== null ? u = Mt(u) : (u = dt(n) ? Tr : Ye.current, u = zo(t, u));
    var v = n.getDerivedStateFromProps;
    (d = typeof v == "function" || typeof s.getSnapshotBeforeUpdate == "function") || typeof s.UNSAFE_componentWillReceiveProps != "function" && typeof s.componentWillReceiveProps != "function" || (a !== m || f !== u) && Mh(t, s, r, u), Kn = !1, f = t.memoizedState, s.state = f, hu(t, r, s, o);
    var h = t.memoizedState;
    a !== m || f !== h || ct.current || Kn ? (typeof v == "function" && (yd(t, n, v, r), h = t.memoizedState), (c = Kn || Fh(t, n, c, r, f, h, u) || !1) ? (d || typeof s.UNSAFE_componentWillUpdate != "function" && typeof s.componentWillUpdate != "function" || (typeof s.componentWillUpdate == "function" && s.componentWillUpdate(r, h, u), typeof s.UNSAFE_componentWillUpdate == "function" && s.UNSAFE_componentWillUpdate(r, h, u)), typeof s.componentDidUpdate == "function" && (t.flags |= 4), typeof s.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof s.componentDidUpdate != "function" || a === e.memoizedProps && f === e.memoizedState || (t.flags |= 4), typeof s.getSnapshotBeforeUpdate != "function" || a === e.memoizedProps && f === e.memoizedState || (t.flags |= 1024), t.memoizedProps = r, t.memoizedState = h), s.props = r, s.state = h, s.context = u, r = c) : (typeof s.componentDidUpdate != "function" || a === e.memoizedProps && f === e.memoizedState || (t.flags |= 4), typeof s.getSnapshotBeforeUpdate != "function" || a === e.memoizedProps && f === e.memoizedState || (t.flags |= 1024), r = !1);
  }
  return Cd(e, t, n, r, i, o);
}
function Cd(e, t, n, r, o, i) {
  dw(e, t);
  var s = (t.flags & 128) !== 0;
  if (!r && !s) return o && Ch(t, n, !1), Mn(e, t, i);
  r = t.stateNode, cb.current = t;
  var a = s && typeof n.getDerivedStateFromError != "function" ? null : r.render();
  return t.flags |= 1, e !== null && s ? (t.child = Uo(t, e.child, null, i), t.child = Uo(t, null, a, i)) : Xe(e, t, a, i), t.memoizedState = r.state, o && Ch(t, n, !0), t.child;
}
function fw(e) {
  var t = e.stateNode;
  t.pendingContext ? xh(e, t.pendingContext, t.pendingContext !== t.context) : t.context && xh(e, t.context, !1), Gf(e, t.containerInfo);
}
function jh(e, t, n, r, o) {
  return Bo(), Bf(o), t.flags |= 256, Xe(e, t, n, r), t.child;
}
var bd = { dehydrated: null, treeContext: null, retryLane: 0 };
function Ed(e) {
  return { baseLanes: e, cachePool: null, transitions: null };
}
function mw(e, t, n) {
  var r = t.pendingProps, o = Se.current, i = !1, s = (t.flags & 128) !== 0, a;
  if ((a = s) || (a = e !== null && e.memoizedState === null ? !1 : (o & 2) !== 0), a ? (i = !0, t.flags &= -129) : (e === null || e.memoizedState !== null) && (o |= 1), me(Se, o & 1), e === null)
    return vd(t), e = t.memoizedState, e !== null && (e = e.dehydrated, e !== null) ? (t.mode & 1 ? e.data === "$!" ? t.lanes = 8 : t.lanes = 1073741824 : t.lanes = 1, null) : (s = r.children, e = r.fallback, i ? (r = t.mode, i = t.child, s = { mode: "hidden", children: s }, !(r & 1) && i !== null ? (i.childLanes = 0, i.pendingProps = s) : i = qu(s, r, 0, null), e = Ir(e, r, n, null), i.return = t, e.return = t, i.sibling = e, t.child = i, t.child.memoizedState = Ed(n), t.memoizedState = bd, e) : nm(t, s));
  if (o = e.memoizedState, o !== null && (a = o.dehydrated, a !== null)) return db(e, t, s, r, a, o, n);
  if (i) {
    i = r.fallback, s = t.mode, o = e.child, a = o.sibling;
    var u = { mode: "hidden", children: r.children };
    return !(s & 1) && t.child !== o ? (r = t.child, r.childLanes = 0, r.pendingProps = u, t.deletions = null) : (r = ir(o, u), r.subtreeFlags = o.subtreeFlags & 14680064), a !== null ? i = ir(a, i) : (i = Ir(i, s, n, null), i.flags |= 2), i.return = t, r.return = t, r.sibling = i, t.child = r, r = i, i = t.child, s = e.child.memoizedState, s = s === null ? Ed(n) : { baseLanes: s.baseLanes | n, cachePool: null, transitions: s.transitions }, i.memoizedState = s, i.childLanes = e.childLanes & ~n, t.memoizedState = bd, r;
  }
  return i = e.child, e = i.sibling, r = ir(i, { mode: "visible", children: r.children }), !(t.mode & 1) && (r.lanes = n), r.return = t, r.sibling = null, e !== null && (n = t.deletions, n === null ? (t.deletions = [e], t.flags |= 16) : n.push(e)), t.child = r, t.memoizedState = null, r;
}
function nm(e, t) {
  return t = qu({ mode: "visible", children: t }, e.mode, 0, null), t.return = e, e.child = t;
}
function ia(e, t, n, r) {
  return r !== null && Bf(r), Uo(t, e.child, null, n), e = nm(t, t.pendingProps.children), e.flags |= 2, t.memoizedState = null, e;
}
function db(e, t, n, r, o, i, s) {
  if (n)
    return t.flags & 256 ? (t.flags &= -257, r = hc(Error(W(422))), ia(e, t, s, r)) : t.memoizedState !== null ? (t.child = e.child, t.flags |= 128, null) : (i = r.fallback, o = t.mode, r = qu({ mode: "visible", children: r.children }, o, 0, null), i = Ir(i, o, s, null), i.flags |= 2, r.return = t, i.return = t, r.sibling = i, t.child = r, t.mode & 1 && Uo(t, e.child, null, s), t.child.memoizedState = Ed(s), t.memoizedState = bd, i);
  if (!(t.mode & 1)) return ia(e, t, s, null);
  if (o.data === "$!") {
    if (r = o.nextSibling && o.nextSibling.dataset, r) var a = r.dgst;
    return r = a, i = Error(W(419)), r = hc(i, r, void 0), ia(e, t, s, r);
  }
  if (a = (s & e.childLanes) !== 0, lt || a) {
    if (r = Ae, r !== null) {
      switch (s & -s) {
        case 4:
          o = 2;
          break;
        case 16:
          o = 8;
          break;
        case 64:
        case 128:
        case 256:
        case 512:
        case 1024:
        case 2048:
        case 4096:
        case 8192:
        case 16384:
        case 32768:
        case 65536:
        case 131072:
        case 262144:
        case 524288:
        case 1048576:
        case 2097152:
        case 4194304:
        case 8388608:
        case 16777216:
        case 33554432:
        case 67108864:
          o = 32;
          break;
        case 536870912:
          o = 268435456;
          break;
        default:
          o = 0;
      }
      o = o & (r.suspendedLanes | s) ? 0 : o, o !== 0 && o !== i.retryLane && (i.retryLane = o, Fn(e, o), Ht(r, e, o, -1));
    }
    return um(), r = hc(Error(W(421))), ia(e, t, s, r);
  }
  return o.data === "$?" ? (t.flags |= 128, t.child = e.child, t = Eb.bind(null, e), o._reactRetry = t, null) : (e = i.treeContext, yt = tr(o.nextSibling), wt = t, ye = !0, Wt = null, e !== null && (It[Tt++] = kn, It[Tt++] = Pn, It[Tt++] = Rr, kn = e.id, Pn = e.overflow, Rr = t), t = nm(t, r.children), t.flags |= 4096, t);
}
function Dh(e, t, n) {
  e.lanes |= t;
  var r = e.alternate;
  r !== null && (r.lanes |= t), gd(e.return, t, n);
}
function vc(e, t, n, r, o) {
  var i = e.memoizedState;
  i === null ? e.memoizedState = { isBackwards: t, rendering: null, renderingStartTime: 0, last: r, tail: n, tailMode: o } : (i.isBackwards = t, i.rendering = null, i.renderingStartTime = 0, i.last = r, i.tail = n, i.tailMode = o);
}
function pw(e, t, n) {
  var r = t.pendingProps, o = r.revealOrder, i = r.tail;
  if (Xe(e, t, r.children, n), r = Se.current, r & 2) r = r & 1 | 2, t.flags |= 128;
  else {
    if (e !== null && e.flags & 128) e: for (e = t.child; e !== null; ) {
      if (e.tag === 13) e.memoizedState !== null && Dh(e, n, t);
      else if (e.tag === 19) Dh(e, n, t);
      else if (e.child !== null) {
        e.child.return = e, e = e.child;
        continue;
      }
      if (e === t) break e;
      for (; e.sibling === null; ) {
        if (e.return === null || e.return === t) break e;
        e = e.return;
      }
      e.sibling.return = e.return, e = e.sibling;
    }
    r &= 1;
  }
  if (me(Se, r), !(t.mode & 1)) t.memoizedState = null;
  else switch (o) {
    case "forwards":
      for (n = t.child, o = null; n !== null; ) e = n.alternate, e !== null && vu(e) === null && (o = n), n = n.sibling;
      n = o, n === null ? (o = t.child, t.child = null) : (o = n.sibling, n.sibling = null), vc(t, !1, o, n, i);
      break;
    case "backwards":
      for (n = null, o = t.child, t.child = null; o !== null; ) {
        if (e = o.alternate, e !== null && vu(e) === null) {
          t.child = o;
          break;
        }
        e = o.sibling, o.sibling = n, n = o, o = e;
      }
      vc(t, !0, n, null, i);
      break;
    case "together":
      vc(t, !1, null, null, void 0);
      break;
    default:
      t.memoizedState = null;
  }
  return t.child;
}
function za(e, t) {
  !(t.mode & 1) && e !== null && (e.alternate = null, t.alternate = null, t.flags |= 2);
}
function Mn(e, t, n) {
  if (e !== null && (t.dependencies = e.dependencies), Mr |= t.lanes, !(n & t.childLanes)) return null;
  if (e !== null && t.child !== e.child) throw Error(W(153));
  if (t.child !== null) {
    for (e = t.child, n = ir(e, e.pendingProps), t.child = n, n.return = t; e.sibling !== null; ) e = e.sibling, n = n.sibling = ir(e, e.pendingProps), n.return = t;
    n.sibling = null;
  }
  return t.child;
}
function fb(e, t, n) {
  switch (t.tag) {
    case 3:
      fw(t), Bo();
      break;
    case 5:
      Vy(t);
      break;
    case 1:
      dt(t.type) && cu(t);
      break;
    case 4:
      Gf(t, t.stateNode.containerInfo);
      break;
    case 10:
      var r = t.type._context, o = t.memoizedProps.value;
      me(mu, r._currentValue), r._currentValue = o;
      break;
    case 13:
      if (r = t.memoizedState, r !== null)
        return r.dehydrated !== null ? (me(Se, Se.current & 1), t.flags |= 128, null) : n & t.child.childLanes ? mw(e, t, n) : (me(Se, Se.current & 1), e = Mn(e, t, n), e !== null ? e.sibling : null);
      me(Se, Se.current & 1);
      break;
    case 19:
      if (r = (n & t.childLanes) !== 0, e.flags & 128) {
        if (r) return pw(e, t, n);
        t.flags |= 128;
      }
      if (o = t.memoizedState, o !== null && (o.rendering = null, o.tail = null, o.lastEffect = null), me(Se, Se.current), r) break;
      return null;
    case 22:
    case 23:
      return t.lanes = 0, cw(e, t, n);
  }
  return Mn(e, t, n);
}
var hw, kd, vw, gw;
hw = function(e, t) {
  for (var n = t.child; n !== null; ) {
    if (n.tag === 5 || n.tag === 6) e.appendChild(n.stateNode);
    else if (n.tag !== 4 && n.child !== null) {
      n.child.return = n, n = n.child;
      continue;
    }
    if (n === t) break;
    for (; n.sibling === null; ) {
      if (n.return === null || n.return === t) return;
      n = n.return;
    }
    n.sibling.return = n.return, n = n.sibling;
  }
};
kd = function() {
};
vw = function(e, t, n, r) {
  var o = e.memoizedProps;
  if (o !== r) {
    e = t.stateNode, Cr(dn.current);
    var i = null;
    switch (n) {
      case "input":
        o = Kc(e, o), r = Kc(e, r), i = [];
        break;
      case "select":
        o = Ce({}, o, { value: void 0 }), r = Ce({}, r, { value: void 0 }), i = [];
        break;
      case "textarea":
        o = Qc(e, o), r = Qc(e, r), i = [];
        break;
      default:
        typeof o.onClick != "function" && typeof r.onClick == "function" && (e.onclick = uu);
    }
    Zc(n, r);
    var s;
    n = null;
    for (c in o) if (!r.hasOwnProperty(c) && o.hasOwnProperty(c) && o[c] != null) if (c === "style") {
      var a = o[c];
      for (s in a) a.hasOwnProperty(s) && (n || (n = {}), n[s] = "");
    } else c !== "dangerouslySetInnerHTML" && c !== "children" && c !== "suppressContentEditableWarning" && c !== "suppressHydrationWarning" && c !== "autoFocus" && (Qi.hasOwnProperty(c) ? i || (i = []) : (i = i || []).push(c, null));
    for (c in r) {
      var u = r[c];
      if (a = o?.[c], r.hasOwnProperty(c) && u !== a && (u != null || a != null)) if (c === "style") if (a) {
        for (s in a) !a.hasOwnProperty(s) || u && u.hasOwnProperty(s) || (n || (n = {}), n[s] = "");
        for (s in u) u.hasOwnProperty(s) && a[s] !== u[s] && (n || (n = {}), n[s] = u[s]);
      } else n || (i || (i = []), i.push(
        c,
        n
      )), n = u;
      else c === "dangerouslySetInnerHTML" ? (u = u ? u.__html : void 0, a = a ? a.__html : void 0, u != null && a !== u && (i = i || []).push(c, u)) : c === "children" ? typeof u != "string" && typeof u != "number" || (i = i || []).push(c, "" + u) : c !== "suppressContentEditableWarning" && c !== "suppressHydrationWarning" && (Qi.hasOwnProperty(c) ? (u != null && c === "onScroll" && he("scroll", e), i || a === u || (i = [])) : (i = i || []).push(c, u));
    }
    n && (i = i || []).push("style", n);
    var c = i;
    (t.updateQueue = c) && (t.flags |= 4);
  }
};
gw = function(e, t, n, r) {
  n !== r && (t.flags |= 4);
};
function gi(e, t) {
  if (!ye) switch (e.tailMode) {
    case "hidden":
      t = e.tail;
      for (var n = null; t !== null; ) t.alternate !== null && (n = t), t = t.sibling;
      n === null ? e.tail = null : n.sibling = null;
      break;
    case "collapsed":
      n = e.tail;
      for (var r = null; n !== null; ) n.alternate !== null && (r = n), n = n.sibling;
      r === null ? t || e.tail === null ? e.tail = null : e.tail.sibling = null : r.sibling = null;
  }
}
function He(e) {
  var t = e.alternate !== null && e.alternate.child === e.child, n = 0, r = 0;
  if (t) for (var o = e.child; o !== null; ) n |= o.lanes | o.childLanes, r |= o.subtreeFlags & 14680064, r |= o.flags & 14680064, o.return = e, o = o.sibling;
  else for (o = e.child; o !== null; ) n |= o.lanes | o.childLanes, r |= o.subtreeFlags, r |= o.flags, o.return = e, o = o.sibling;
  return e.subtreeFlags |= r, e.childLanes = n, t;
}
function mb(e, t, n) {
  var r = t.pendingProps;
  switch (zf(t), t.tag) {
    case 2:
    case 16:
    case 15:
    case 0:
    case 11:
    case 7:
    case 8:
    case 12:
    case 9:
    case 14:
      return He(t), null;
    case 1:
      return dt(t.type) && lu(), He(t), null;
    case 3:
      return r = t.stateNode, Wo(), ve(ct), ve(Ye), Qf(), r.pendingContext && (r.context = r.pendingContext, r.pendingContext = null), (e === null || e.child === null) && (ra(t) ? t.flags |= 4 : e === null || e.memoizedState.isDehydrated && !(t.flags & 256) || (t.flags |= 1024, Wt !== null && ($d(Wt), Wt = null))), kd(e, t), He(t), null;
    case 5:
      Yf(t);
      var o = Cr(us.current);
      if (n = t.type, e !== null && t.stateNode != null) vw(e, t, n, r, o), e.ref !== t.ref && (t.flags |= 512, t.flags |= 2097152);
      else {
        if (!r) {
          if (t.stateNode === null) throw Error(W(166));
          return He(t), null;
        }
        if (e = Cr(dn.current), ra(t)) {
          r = t.stateNode, n = t.type;
          var i = t.memoizedProps;
          switch (r[un] = t, r[ss] = i, e = (t.mode & 1) !== 0, n) {
            case "dialog":
              he("cancel", r), he("close", r);
              break;
            case "iframe":
            case "object":
            case "embed":
              he("load", r);
              break;
            case "video":
            case "audio":
              for (o = 0; o < Ai.length; o++) he(Ai[o], r);
              break;
            case "source":
              he("error", r);
              break;
            case "img":
            case "image":
            case "link":
              he(
                "error",
                r
              ), he("load", r);
              break;
            case "details":
              he("toggle", r);
              break;
            case "input":
              Gp(r, i), he("invalid", r);
              break;
            case "select":
              r._wrapperState = { wasMultiple: !!i.multiple }, he("invalid", r);
              break;
            case "textarea":
              Qp(r, i), he("invalid", r);
          }
          Zc(n, i), o = null;
          for (var s in i) if (i.hasOwnProperty(s)) {
            var a = i[s];
            s === "children" ? typeof a == "string" ? r.textContent !== a && (i.suppressHydrationWarning !== !0 && na(r.textContent, a, e), o = ["children", a]) : typeof a == "number" && r.textContent !== "" + a && (i.suppressHydrationWarning !== !0 && na(
              r.textContent,
              a,
              e
            ), o = ["children", "" + a]) : Qi.hasOwnProperty(s) && a != null && s === "onScroll" && he("scroll", r);
          }
          switch (n) {
            case "input":
              Gs(r), Yp(r, i, !0);
              break;
            case "textarea":
              Gs(r), Jp(r);
              break;
            case "select":
            case "option":
              break;
            default:
              typeof i.onClick == "function" && (r.onclick = uu);
          }
          r = o, t.updateQueue = r, r !== null && (t.flags |= 4);
        } else {
          s = o.nodeType === 9 ? o : o.ownerDocument, e === "http://www.w3.org/1999/xhtml" && (e = qg(n)), e === "http://www.w3.org/1999/xhtml" ? n === "script" ? (e = s.createElement("div"), e.innerHTML = "<script><\/script>", e = e.removeChild(e.firstChild)) : typeof r.is == "string" ? e = s.createElement(n, { is: r.is }) : (e = s.createElement(n), n === "select" && (s = e, r.multiple ? s.multiple = !0 : r.size && (s.size = r.size))) : e = s.createElementNS(e, n), e[un] = t, e[ss] = r, hw(e, t, !1, !1), t.stateNode = e;
          e: {
            switch (s = Xc(n, r), n) {
              case "dialog":
                he("cancel", e), he("close", e), o = r;
                break;
              case "iframe":
              case "object":
              case "embed":
                he("load", e), o = r;
                break;
              case "video":
              case "audio":
                for (o = 0; o < Ai.length; o++) he(Ai[o], e);
                o = r;
                break;
              case "source":
                he("error", e), o = r;
                break;
              case "img":
              case "image":
              case "link":
                he(
                  "error",
                  e
                ), he("load", e), o = r;
                break;
              case "details":
                he("toggle", e), o = r;
                break;
              case "input":
                Gp(e, r), o = Kc(e, r), he("invalid", e);
                break;
              case "option":
                o = r;
                break;
              case "select":
                e._wrapperState = { wasMultiple: !!r.multiple }, o = Ce({}, r, { value: void 0 }), he("invalid", e);
                break;
              case "textarea":
                Qp(e, r), o = Qc(e, r), he("invalid", e);
                break;
              default:
                o = r;
            }
            Zc(n, o), a = o;
            for (i in a) if (a.hasOwnProperty(i)) {
              var u = a[i];
              i === "style" ? Gg(e, u) : i === "dangerouslySetInnerHTML" ? (u = u ? u.__html : void 0, u != null && Hg(e, u)) : i === "children" ? typeof u == "string" ? (n !== "textarea" || u !== "") && Ji(e, u) : typeof u == "number" && Ji(e, "" + u) : i !== "suppressContentEditableWarning" && i !== "suppressHydrationWarning" && i !== "autoFocus" && (Qi.hasOwnProperty(i) ? u != null && i === "onScroll" && he("scroll", e) : u != null && Pf(e, i, u, s));
            }
            switch (n) {
              case "input":
                Gs(e), Yp(e, r, !1);
                break;
              case "textarea":
                Gs(e), Jp(e);
                break;
              case "option":
                r.value != null && e.setAttribute("value", "" + ar(r.value));
                break;
              case "select":
                e.multiple = !!r.multiple, i = r.value, i != null ? Ro(e, !!r.multiple, i, !1) : r.defaultValue != null && Ro(
                  e,
                  !!r.multiple,
                  r.defaultValue,
                  !0
                );
                break;
              default:
                typeof o.onClick == "function" && (e.onclick = uu);
            }
            switch (n) {
              case "button":
              case "input":
              case "select":
              case "textarea":
                r = !!r.autoFocus;
                break e;
              case "img":
                r = !0;
                break e;
              default:
                r = !1;
            }
          }
          r && (t.flags |= 4);
        }
        t.ref !== null && (t.flags |= 512, t.flags |= 2097152);
      }
      return He(t), null;
    case 6:
      if (e && t.stateNode != null) gw(e, t, e.memoizedProps, r);
      else {
        if (typeof r != "string" && t.stateNode === null) throw Error(W(166));
        if (n = Cr(us.current), Cr(dn.current), ra(t)) {
          if (r = t.stateNode, n = t.memoizedProps, r[un] = t, (i = r.nodeValue !== n) && (e = wt, e !== null)) switch (e.tag) {
            case 3:
              na(r.nodeValue, n, (e.mode & 1) !== 0);
              break;
            case 5:
              e.memoizedProps.suppressHydrationWarning !== !0 && na(r.nodeValue, n, (e.mode & 1) !== 0);
          }
          i && (t.flags |= 4);
        } else r = (n.nodeType === 9 ? n : n.ownerDocument).createTextNode(r), r[un] = t, t.stateNode = r;
      }
      return He(t), null;
    case 13:
      if (ve(Se), r = t.memoizedState, e === null || e.memoizedState !== null && e.memoizedState.dehydrated !== null) {
        if (ye && yt !== null && t.mode & 1 && !(t.flags & 128)) Ay(), Bo(), t.flags |= 98560, i = !1;
        else if (i = ra(t), r !== null && r.dehydrated !== null) {
          if (e === null) {
            if (!i) throw Error(W(318));
            if (i = t.memoizedState, i = i !== null ? i.dehydrated : null, !i) throw Error(W(317));
            i[un] = t;
          } else Bo(), !(t.flags & 128) && (t.memoizedState = null), t.flags |= 4;
          He(t), i = !1;
        } else Wt !== null && ($d(Wt), Wt = null), i = !0;
        if (!i) return t.flags & 65536 ? t : null;
      }
      return t.flags & 128 ? (t.lanes = n, t) : (r = r !== null, r !== (e !== null && e.memoizedState !== null) && r && (t.child.flags |= 8192, t.mode & 1 && (e === null || Se.current & 1 ? Ne === 0 && (Ne = 3) : um())), t.updateQueue !== null && (t.flags |= 4), He(t), null);
    case 4:
      return Wo(), kd(e, t), e === null && os(t.stateNode.containerInfo), He(t), null;
    case 10:
      return qf(t.type._context), He(t), null;
    case 17:
      return dt(t.type) && lu(), He(t), null;
    case 19:
      if (ve(Se), i = t.memoizedState, i === null) return He(t), null;
      if (r = (t.flags & 128) !== 0, s = i.rendering, s === null) if (r) gi(i, !1);
      else {
        if (Ne !== 0 || e !== null && e.flags & 128) for (e = t.child; e !== null; ) {
          if (s = vu(e), s !== null) {
            for (t.flags |= 128, gi(i, !1), r = s.updateQueue, r !== null && (t.updateQueue = r, t.flags |= 4), t.subtreeFlags = 0, r = n, n = t.child; n !== null; ) i = n, e = r, i.flags &= 14680066, s = i.alternate, s === null ? (i.childLanes = 0, i.lanes = e, i.child = null, i.subtreeFlags = 0, i.memoizedProps = null, i.memoizedState = null, i.updateQueue = null, i.dependencies = null, i.stateNode = null) : (i.childLanes = s.childLanes, i.lanes = s.lanes, i.child = s.child, i.subtreeFlags = 0, i.deletions = null, i.memoizedProps = s.memoizedProps, i.memoizedState = s.memoizedState, i.updateQueue = s.updateQueue, i.type = s.type, e = s.dependencies, i.dependencies = e === null ? null : { lanes: e.lanes, firstContext: e.firstContext }), n = n.sibling;
            return me(Se, Se.current & 1 | 2), t.child;
          }
          e = e.sibling;
        }
        i.tail !== null && Ie() > Ho && (t.flags |= 128, r = !0, gi(i, !1), t.lanes = 4194304);
      }
      else {
        if (!r) if (e = vu(s), e !== null) {
          if (t.flags |= 128, r = !0, n = e.updateQueue, n !== null && (t.updateQueue = n, t.flags |= 4), gi(i, !0), i.tail === null && i.tailMode === "hidden" && !s.alternate && !ye) return He(t), null;
        } else 2 * Ie() - i.renderingStartTime > Ho && n !== 1073741824 && (t.flags |= 128, r = !0, gi(i, !1), t.lanes = 4194304);
        i.isBackwards ? (s.sibling = t.child, t.child = s) : (n = i.last, n !== null ? n.sibling = s : t.child = s, i.last = s);
      }
      return i.tail !== null ? (t = i.tail, i.rendering = t, i.tail = t.sibling, i.renderingStartTime = Ie(), t.sibling = null, n = Se.current, me(Se, r ? n & 1 | 2 : n & 1), t) : (He(t), null);
    case 22:
    case 23:
      return am(), r = t.memoizedState !== null, e !== null && e.memoizedState !== null !== r && (t.flags |= 8192), r && t.mode & 1 ? gt & 1073741824 && (He(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : He(t), null;
    case 24:
      return null;
    case 25:
      return null;
  }
  throw Error(W(156, t.tag));
}
function pb(e, t) {
  switch (zf(t), t.tag) {
    case 1:
      return dt(t.type) && lu(), e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
    case 3:
      return Wo(), ve(ct), ve(Ye), Qf(), e = t.flags, e & 65536 && !(e & 128) ? (t.flags = e & -65537 | 128, t) : null;
    case 5:
      return Yf(t), null;
    case 13:
      if (ve(Se), e = t.memoizedState, e !== null && e.dehydrated !== null) {
        if (t.alternate === null) throw Error(W(340));
        Bo();
      }
      return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
    case 19:
      return ve(Se), null;
    case 4:
      return Wo(), null;
    case 10:
      return qf(t.type._context), null;
    case 22:
    case 23:
      return am(), null;
    case 24:
      return null;
    default:
      return null;
  }
}
var sa = !1, Ke = !1, hb = typeof WeakSet == "function" ? WeakSet : Set, Y = null;
function bo(e, t) {
  var n = e.ref;
  if (n !== null) if (typeof n == "function") try {
    n(null);
  } catch (r) {
    Pe(e, t, r);
  }
  else n.current = null;
}
function Pd(e, t, n) {
  try {
    n();
  } catch (r) {
    Pe(e, t, r);
  }
}
var Vh = !1;
function vb(e, t) {
  if (ld = iu, e = Cy(), Df(e)) {
    if ("selectionStart" in e) var n = { start: e.selectionStart, end: e.selectionEnd };
    else e: {
      n = (n = e.ownerDocument) && n.defaultView || window;
      var r = n.getSelection && n.getSelection();
      if (r && r.rangeCount !== 0) {
        n = r.anchorNode;
        var o = r.anchorOffset, i = r.focusNode;
        r = r.focusOffset;
        try {
          n.nodeType, i.nodeType;
        } catch {
          n = null;
          break e;
        }
        var s = 0, a = -1, u = -1, c = 0, d = 0, m = e, f = null;
        t: for (; ; ) {
          for (var v; m !== n || o !== 0 && m.nodeType !== 3 || (a = s + o), m !== i || r !== 0 && m.nodeType !== 3 || (u = s + r), m.nodeType === 3 && (s += m.nodeValue.length), (v = m.firstChild) !== null; )
            f = m, m = v;
          for (; ; ) {
            if (m === e) break t;
            if (f === n && ++c === o && (a = s), f === i && ++d === r && (u = s), (v = m.nextSibling) !== null) break;
            m = f, f = m.parentNode;
          }
          m = v;
        }
        n = a === -1 || u === -1 ? null : { start: a, end: u };
      } else n = null;
    }
    n = n || { start: 0, end: 0 };
  } else n = null;
  for (cd = { focusedElem: e, selectionRange: n }, iu = !1, Y = t; Y !== null; ) if (t = Y, e = t.child, (t.subtreeFlags & 1028) !== 0 && e !== null) e.return = t, Y = e;
  else for (; Y !== null; ) {
    t = Y;
    try {
      var h = t.alternate;
      if (t.flags & 1024) switch (t.tag) {
        case 0:
        case 11:
        case 15:
          break;
        case 1:
          if (h !== null) {
            var w = h.memoizedProps, x = h.memoizedState, g = t.stateNode, p = g.getSnapshotBeforeUpdate(t.elementType === t.type ? w : Bt(t.type, w), x);
            g.__reactInternalSnapshotBeforeUpdate = p;
          }
          break;
        case 3:
          var y = t.stateNode.containerInfo;
          y.nodeType === 1 ? y.textContent = "" : y.nodeType === 9 && y.documentElement && y.removeChild(y.documentElement);
          break;
        case 5:
        case 6:
        case 4:
        case 17:
          break;
        default:
          throw Error(W(163));
      }
    } catch (C) {
      Pe(t, t.return, C);
    }
    if (e = t.sibling, e !== null) {
      e.return = t.return, Y = e;
      break;
    }
    Y = t.return;
  }
  return h = Vh, Vh = !1, h;
}
function Hi(e, t, n) {
  var r = t.updateQueue;
  if (r = r !== null ? r.lastEffect : null, r !== null) {
    var o = r = r.next;
    do {
      if ((o.tag & e) === e) {
        var i = o.destroy;
        o.destroy = void 0, i !== void 0 && Pd(t, n, i);
      }
      o = o.next;
    } while (o !== r);
  }
}
function Uu(e, t) {
  if (t = t.updateQueue, t = t !== null ? t.lastEffect : null, t !== null) {
    var n = t = t.next;
    do {
      if ((n.tag & e) === e) {
        var r = n.create;
        n.destroy = r();
      }
      n = n.next;
    } while (n !== t);
  }
}
function Id(e) {
  var t = e.ref;
  if (t !== null) {
    var n = e.stateNode;
    switch (e.tag) {
      case 5:
        e = n;
        break;
      default:
        e = n;
    }
    typeof t == "function" ? t(e) : t.current = e;
  }
}
function yw(e) {
  var t = e.alternate;
  t !== null && (e.alternate = null, yw(t)), e.child = null, e.deletions = null, e.sibling = null, e.tag === 5 && (t = e.stateNode, t !== null && (delete t[un], delete t[ss], delete t[md], delete t[ZC], delete t[XC])), e.stateNode = null, e.return = null, e.dependencies = null, e.memoizedProps = null, e.memoizedState = null, e.pendingProps = null, e.stateNode = null, e.updateQueue = null;
}
function ww(e) {
  return e.tag === 5 || e.tag === 3 || e.tag === 4;
}
function zh(e) {
  e: for (; ; ) {
    for (; e.sibling === null; ) {
      if (e.return === null || ww(e.return)) return null;
      e = e.return;
    }
    for (e.sibling.return = e.return, e = e.sibling; e.tag !== 5 && e.tag !== 6 && e.tag !== 18; ) {
      if (e.flags & 2 || e.child === null || e.tag === 4) continue e;
      e.child.return = e, e = e.child;
    }
    if (!(e.flags & 2)) return e.stateNode;
  }
}
function Td(e, t, n) {
  var r = e.tag;
  if (r === 5 || r === 6) e = e.stateNode, t ? n.nodeType === 8 ? n.parentNode.insertBefore(e, t) : n.insertBefore(e, t) : (n.nodeType === 8 ? (t = n.parentNode, t.insertBefore(e, n)) : (t = n, t.appendChild(e)), n = n._reactRootContainer, n != null || t.onclick !== null || (t.onclick = uu));
  else if (r !== 4 && (e = e.child, e !== null)) for (Td(e, t, n), e = e.sibling; e !== null; ) Td(e, t, n), e = e.sibling;
}
function Rd(e, t, n) {
  var r = e.tag;
  if (r === 5 || r === 6) e = e.stateNode, t ? n.insertBefore(e, t) : n.appendChild(e);
  else if (r !== 4 && (e = e.child, e !== null)) for (Rd(e, t, n), e = e.sibling; e !== null; ) Rd(e, t, n), e = e.sibling;
}
var De = null, Ut = !1;
function Wn(e, t, n) {
  for (n = n.child; n !== null; ) Sw(e, t, n), n = n.sibling;
}
function Sw(e, t, n) {
  if (cn && typeof cn.onCommitFiberUnmount == "function") try {
    cn.onCommitFiberUnmount(Au, n);
  } catch {
  }
  switch (n.tag) {
    case 5:
      Ke || bo(n, t);
    case 6:
      var r = De, o = Ut;
      De = null, Wn(e, t, n), De = r, Ut = o, De !== null && (Ut ? (e = De, n = n.stateNode, e.nodeType === 8 ? e.parentNode.removeChild(n) : e.removeChild(n)) : De.removeChild(n.stateNode));
      break;
    case 18:
      De !== null && (Ut ? (e = De, n = n.stateNode, e.nodeType === 8 ? lc(e.parentNode, n) : e.nodeType === 1 && lc(e, n), ts(e)) : lc(De, n.stateNode));
      break;
    case 4:
      r = De, o = Ut, De = n.stateNode.containerInfo, Ut = !0, Wn(e, t, n), De = r, Ut = o;
      break;
    case 0:
    case 11:
    case 14:
    case 15:
      if (!Ke && (r = n.updateQueue, r !== null && (r = r.lastEffect, r !== null))) {
        o = r = r.next;
        do {
          var i = o, s = i.destroy;
          i = i.tag, s !== void 0 && (i & 2 || i & 4) && Pd(n, t, s), o = o.next;
        } while (o !== r);
      }
      Wn(e, t, n);
      break;
    case 1:
      if (!Ke && (bo(n, t), r = n.stateNode, typeof r.componentWillUnmount == "function")) try {
        r.props = n.memoizedProps, r.state = n.memoizedState, r.componentWillUnmount();
      } catch (a) {
        Pe(n, t, a);
      }
      Wn(e, t, n);
      break;
    case 21:
      Wn(e, t, n);
      break;
    case 22:
      n.mode & 1 ? (Ke = (r = Ke) || n.memoizedState !== null, Wn(e, t, n), Ke = r) : Wn(e, t, n);
      break;
    default:
      Wn(e, t, n);
  }
}
function Bh(e) {
  var t = e.updateQueue;
  if (t !== null) {
    e.updateQueue = null;
    var n = e.stateNode;
    n === null && (n = e.stateNode = new hb()), t.forEach(function(r) {
      var o = kb.bind(null, e, r);
      n.has(r) || (n.add(r), r.then(o, o));
    });
  }
}
function Dt(e, t) {
  var n = t.deletions;
  if (n !== null) for (var r = 0; r < n.length; r++) {
    var o = n[r];
    try {
      var i = e, s = t, a = s;
      e: for (; a !== null; ) {
        switch (a.tag) {
          case 5:
            De = a.stateNode, Ut = !1;
            break e;
          case 3:
            De = a.stateNode.containerInfo, Ut = !0;
            break e;
          case 4:
            De = a.stateNode.containerInfo, Ut = !0;
            break e;
        }
        a = a.return;
      }
      if (De === null) throw Error(W(160));
      Sw(i, s, o), De = null, Ut = !1;
      var u = o.alternate;
      u !== null && (u.return = null), o.return = null;
    } catch (c) {
      Pe(o, t, c);
    }
  }
  if (t.subtreeFlags & 12854) for (t = t.child; t !== null; ) xw(t, e), t = t.sibling;
}
function xw(e, t) {
  var n = e.alternate, r = e.flags;
  switch (e.tag) {
    case 0:
    case 11:
    case 14:
    case 15:
      if (Dt(t, e), nn(e), r & 4) {
        try {
          Hi(3, e, e.return), Uu(3, e);
        } catch (w) {
          Pe(e, e.return, w);
        }
        try {
          Hi(5, e, e.return);
        } catch (w) {
          Pe(e, e.return, w);
        }
      }
      break;
    case 1:
      Dt(t, e), nn(e), r & 512 && n !== null && bo(n, n.return);
      break;
    case 5:
      if (Dt(t, e), nn(e), r & 512 && n !== null && bo(n, n.return), e.flags & 32) {
        var o = e.stateNode;
        try {
          Ji(o, "");
        } catch (w) {
          Pe(e, e.return, w);
        }
      }
      if (r & 4 && (o = e.stateNode, o != null)) {
        var i = e.memoizedProps, s = n !== null ? n.memoizedProps : i, a = e.type, u = e.updateQueue;
        if (e.updateQueue = null, u !== null) try {
          a === "input" && i.type === "radio" && i.name != null && Ug(o, i), Xc(a, s);
          var c = Xc(a, i);
          for (s = 0; s < u.length; s += 2) {
            var d = u[s], m = u[s + 1];
            d === "style" ? Gg(o, m) : d === "dangerouslySetInnerHTML" ? Hg(o, m) : d === "children" ? Ji(o, m) : Pf(o, d, m, c);
          }
          switch (a) {
            case "input":
              Gc(o, i);
              break;
            case "textarea":
              Wg(o, i);
              break;
            case "select":
              var f = o._wrapperState.wasMultiple;
              o._wrapperState.wasMultiple = !!i.multiple;
              var v = i.value;
              v != null ? Ro(o, !!i.multiple, v, !1) : f !== !!i.multiple && (i.defaultValue != null ? Ro(
                o,
                !!i.multiple,
                i.defaultValue,
                !0
              ) : Ro(o, !!i.multiple, i.multiple ? [] : "", !1));
          }
          o[ss] = i;
        } catch (w) {
          Pe(e, e.return, w);
        }
      }
      break;
    case 6:
      if (Dt(t, e), nn(e), r & 4) {
        if (e.stateNode === null) throw Error(W(162));
        o = e.stateNode, i = e.memoizedProps;
        try {
          o.nodeValue = i;
        } catch (w) {
          Pe(e, e.return, w);
        }
      }
      break;
    case 3:
      if (Dt(t, e), nn(e), r & 4 && n !== null && n.memoizedState.isDehydrated) try {
        ts(t.containerInfo);
      } catch (w) {
        Pe(e, e.return, w);
      }
      break;
    case 4:
      Dt(t, e), nn(e);
      break;
    case 13:
      Dt(t, e), nn(e), o = e.child, o.flags & 8192 && (i = o.memoizedState !== null, o.stateNode.isHidden = i, !i || o.alternate !== null && o.alternate.memoizedState !== null || (im = Ie())), r & 4 && Bh(e);
      break;
    case 22:
      if (d = n !== null && n.memoizedState !== null, e.mode & 1 ? (Ke = (c = Ke) || d, Dt(t, e), Ke = c) : Dt(t, e), nn(e), r & 8192) {
        if (c = e.memoizedState !== null, (e.stateNode.isHidden = c) && !d && e.mode & 1) for (Y = e, d = e.child; d !== null; ) {
          for (m = Y = d; Y !== null; ) {
            switch (f = Y, v = f.child, f.tag) {
              case 0:
              case 11:
              case 14:
              case 15:
                Hi(4, f, f.return);
                break;
              case 1:
                bo(f, f.return);
                var h = f.stateNode;
                if (typeof h.componentWillUnmount == "function") {
                  r = f, n = f.return;
                  try {
                    t = r, h.props = t.memoizedProps, h.state = t.memoizedState, h.componentWillUnmount();
                  } catch (w) {
                    Pe(r, n, w);
                  }
                }
                break;
              case 5:
                bo(f, f.return);
                break;
              case 22:
                if (f.memoizedState !== null) {
                  Wh(m);
                  continue;
                }
            }
            v !== null ? (v.return = f, Y = v) : Wh(m);
          }
          d = d.sibling;
        }
        e: for (d = null, m = e; ; ) {
          if (m.tag === 5) {
            if (d === null) {
              d = m;
              try {
                o = m.stateNode, c ? (i = o.style, typeof i.setProperty == "function" ? i.setProperty("display", "none", "important") : i.display = "none") : (a = m.stateNode, u = m.memoizedProps.style, s = u != null && u.hasOwnProperty("display") ? u.display : null, a.style.display = Kg("display", s));
              } catch (w) {
                Pe(e, e.return, w);
              }
            }
          } else if (m.tag === 6) {
            if (d === null) try {
              m.stateNode.nodeValue = c ? "" : m.memoizedProps;
            } catch (w) {
              Pe(e, e.return, w);
            }
          } else if ((m.tag !== 22 && m.tag !== 23 || m.memoizedState === null || m === e) && m.child !== null) {
            m.child.return = m, m = m.child;
            continue;
          }
          if (m === e) break e;
          for (; m.sibling === null; ) {
            if (m.return === null || m.return === e) break e;
            d === m && (d = null), m = m.return;
          }
          d === m && (d = null), m.sibling.return = m.return, m = m.sibling;
        }
      }
      break;
    case 19:
      Dt(t, e), nn(e), r & 4 && Bh(e);
      break;
    case 21:
      break;
    default:
      Dt(
        t,
        e
      ), nn(e);
  }
}
function nn(e) {
  var t = e.flags;
  if (t & 2) {
    try {
      e: {
        for (var n = e.return; n !== null; ) {
          if (ww(n)) {
            var r = n;
            break e;
          }
          n = n.return;
        }
        throw Error(W(160));
      }
      switch (r.tag) {
        case 5:
          var o = r.stateNode;
          r.flags & 32 && (Ji(o, ""), r.flags &= -33);
          var i = zh(e);
          Rd(e, i, o);
          break;
        case 3:
        case 4:
          var s = r.stateNode.containerInfo, a = zh(e);
          Td(e, a, s);
          break;
        default:
          throw Error(W(161));
      }
    } catch (u) {
      Pe(e, e.return, u);
    }
    e.flags &= -3;
  }
  t & 4096 && (e.flags &= -4097);
}
function gb(e, t, n) {
  Y = e, Cw(e);
}
function Cw(e, t, n) {
  for (var r = (e.mode & 1) !== 0; Y !== null; ) {
    var o = Y, i = o.child;
    if (o.tag === 22 && r) {
      var s = o.memoizedState !== null || sa;
      if (!s) {
        var a = o.alternate, u = a !== null && a.memoizedState !== null || Ke;
        a = sa;
        var c = Ke;
        if (sa = s, (Ke = u) && !c) for (Y = o; Y !== null; ) s = Y, u = s.child, s.tag === 22 && s.memoizedState !== null ? qh(o) : u !== null ? (u.return = s, Y = u) : qh(o);
        for (; i !== null; ) Y = i, Cw(i), i = i.sibling;
        Y = o, sa = a, Ke = c;
      }
      Uh(e);
    } else o.subtreeFlags & 8772 && i !== null ? (i.return = o, Y = i) : Uh(e);
  }
}
function Uh(e) {
  for (; Y !== null; ) {
    var t = Y;
    if (t.flags & 8772) {
      var n = t.alternate;
      try {
        if (t.flags & 8772) switch (t.tag) {
          case 0:
          case 11:
          case 15:
            Ke || Uu(5, t);
            break;
          case 1:
            var r = t.stateNode;
            if (t.flags & 4 && !Ke) if (n === null) r.componentDidMount();
            else {
              var o = t.elementType === t.type ? n.memoizedProps : Bt(t.type, n.memoizedProps);
              r.componentDidUpdate(o, n.memoizedState, r.__reactInternalSnapshotBeforeUpdate);
            }
            var i = t.updateQueue;
            i !== null && Ih(t, i, r);
            break;
          case 3:
            var s = t.updateQueue;
            if (s !== null) {
              if (n = null, t.child !== null) switch (t.child.tag) {
                case 5:
                  n = t.child.stateNode;
                  break;
                case 1:
                  n = t.child.stateNode;
              }
              Ih(t, s, n);
            }
            break;
          case 5:
            var a = t.stateNode;
            if (n === null && t.flags & 4) {
              n = a;
              var u = t.memoizedProps;
              switch (t.type) {
                case "button":
                case "input":
                case "select":
                case "textarea":
                  u.autoFocus && n.focus();
                  break;
                case "img":
                  u.src && (n.src = u.src);
              }
            }
            break;
          case 6:
            break;
          case 4:
            break;
          case 12:
            break;
          case 13:
            if (t.memoizedState === null) {
              var c = t.alternate;
              if (c !== null) {
                var d = c.memoizedState;
                if (d !== null) {
                  var m = d.dehydrated;
                  m !== null && ts(m);
                }
              }
            }
            break;
          case 19:
          case 17:
          case 21:
          case 22:
          case 23:
          case 25:
            break;
          default:
            throw Error(W(163));
        }
        Ke || t.flags & 512 && Id(t);
      } catch (f) {
        Pe(t, t.return, f);
      }
    }
    if (t === e) {
      Y = null;
      break;
    }
    if (n = t.sibling, n !== null) {
      n.return = t.return, Y = n;
      break;
    }
    Y = t.return;
  }
}
function Wh(e) {
  for (; Y !== null; ) {
    var t = Y;
    if (t === e) {
      Y = null;
      break;
    }
    var n = t.sibling;
    if (n !== null) {
      n.return = t.return, Y = n;
      break;
    }
    Y = t.return;
  }
}
function qh(e) {
  for (; Y !== null; ) {
    var t = Y;
    try {
      switch (t.tag) {
        case 0:
        case 11:
        case 15:
          var n = t.return;
          try {
            Uu(4, t);
          } catch (u) {
            Pe(t, n, u);
          }
          break;
        case 1:
          var r = t.stateNode;
          if (typeof r.componentDidMount == "function") {
            var o = t.return;
            try {
              r.componentDidMount();
            } catch (u) {
              Pe(t, o, u);
            }
          }
          var i = t.return;
          try {
            Id(t);
          } catch (u) {
            Pe(t, i, u);
          }
          break;
        case 5:
          var s = t.return;
          try {
            Id(t);
          } catch (u) {
            Pe(t, s, u);
          }
      }
    } catch (u) {
      Pe(t, t.return, u);
    }
    if (t === e) {
      Y = null;
      break;
    }
    var a = t.sibling;
    if (a !== null) {
      a.return = t.return, Y = a;
      break;
    }
    Y = t.return;
  }
}
var yb = Math.ceil, wu = Nn.ReactCurrentDispatcher, rm = Nn.ReactCurrentOwner, Ft = Nn.ReactCurrentBatchConfig, se = 0, Ae = null, Fe = null, Ve = 0, gt = 0, Eo = cr(0), Ne = 0, fs = null, Mr = 0, Wu = 0, om = 0, Ki = null, at = null, im = 0, Ho = 1 / 0, bn = null, Su = !1, Fd = null, rr = null, aa = !1, Jn = null, xu = 0, Gi = 0, Md = null, Ba = -1, Ua = 0;
function et() {
  return se & 6 ? Ie() : Ba !== -1 ? Ba : Ba = Ie();
}
function or(e) {
  return e.mode & 1 ? se & 2 && Ve !== 0 ? Ve & -Ve : tb.transition !== null ? (Ua === 0 && (Ua = sy()), Ua) : (e = ce, e !== 0 || (e = window.event, e = e === void 0 ? 16 : my(e.type)), e) : 1;
}
function Ht(e, t, n, r) {
  if (50 < Gi) throw Gi = 0, Md = null, Error(W(185));
  ws(e, n, r), (!(se & 2) || e !== Ae) && (e === Ae && (!(se & 2) && (Wu |= n), Ne === 4 && Yn(e, Ve)), ft(e, r), n === 1 && se === 0 && !(t.mode & 1) && (Ho = Ie() + 500, Vu && dr()));
}
function ft(e, t) {
  var n = e.callbackNode;
  tC(e, t);
  var r = ou(e, e === Ae ? Ve : 0);
  if (r === 0) n !== null && eh(n), e.callbackNode = null, e.callbackPriority = 0;
  else if (t = r & -r, e.callbackPriority !== t) {
    if (n != null && eh(n), t === 1) e.tag === 0 ? eb(Hh.bind(null, e)) : Ny(Hh.bind(null, e)), QC(function() {
      !(se & 6) && dr();
    }), n = null;
    else {
      switch (ay(r)) {
        case 1:
          n = Mf;
          break;
        case 4:
          n = oy;
          break;
        case 16:
          n = ru;
          break;
        case 536870912:
          n = iy;
          break;
        default:
          n = ru;
      }
      n = Fw(n, bw.bind(null, e));
    }
    e.callbackPriority = t, e.callbackNode = n;
  }
}
function bw(e, t) {
  if (Ba = -1, Ua = 0, se & 6) throw Error(W(327));
  var n = e.callbackNode;
  if (_o() && e.callbackNode !== n) return null;
  var r = ou(e, e === Ae ? Ve : 0);
  if (r === 0) return null;
  if (r & 30 || r & e.expiredLanes || t) t = Cu(e, r);
  else {
    t = r;
    var o = se;
    se |= 2;
    var i = kw();
    (Ae !== e || Ve !== t) && (bn = null, Ho = Ie() + 500, Pr(e, t));
    do
      try {
        xb();
        break;
      } catch (a) {
        Ew(e, a);
      }
    while (!0);
    Wf(), wu.current = i, se = o, Fe !== null ? t = 0 : (Ae = null, Ve = 0, t = Ne);
  }
  if (t !== 0) {
    if (t === 2 && (o = od(e), o !== 0 && (r = o, t = Nd(e, o))), t === 1) throw n = fs, Pr(e, 0), Yn(e, r), ft(e, Ie()), n;
    if (t === 6) Yn(e, r);
    else {
      if (o = e.current.alternate, !(r & 30) && !wb(o) && (t = Cu(e, r), t === 2 && (i = od(e), i !== 0 && (r = i, t = Nd(e, i))), t === 1)) throw n = fs, Pr(e, 0), Yn(e, r), ft(e, Ie()), n;
      switch (e.finishedWork = o, e.finishedLanes = r, t) {
        case 0:
        case 1:
          throw Error(W(345));
        case 2:
          wr(e, at, bn);
          break;
        case 3:
          if (Yn(e, r), (r & 130023424) === r && (t = im + 500 - Ie(), 10 < t)) {
            if (ou(e, 0) !== 0) break;
            if (o = e.suspendedLanes, (o & r) !== r) {
              et(), e.pingedLanes |= e.suspendedLanes & o;
              break;
            }
            e.timeoutHandle = fd(wr.bind(null, e, at, bn), t);
            break;
          }
          wr(e, at, bn);
          break;
        case 4:
          if (Yn(e, r), (r & 4194240) === r) break;
          for (t = e.eventTimes, o = -1; 0 < r; ) {
            var s = 31 - qt(r);
            i = 1 << s, s = t[s], s > o && (o = s), r &= ~i;
          }
          if (r = o, r = Ie() - r, r = (120 > r ? 120 : 480 > r ? 480 : 1080 > r ? 1080 : 1920 > r ? 1920 : 3e3 > r ? 3e3 : 4320 > r ? 4320 : 1960 * yb(r / 1960)) - r, 10 < r) {
            e.timeoutHandle = fd(wr.bind(null, e, at, bn), r);
            break;
          }
          wr(e, at, bn);
          break;
        case 5:
          wr(e, at, bn);
          break;
        default:
          throw Error(W(329));
      }
    }
  }
  return ft(e, Ie()), e.callbackNode === n ? bw.bind(null, e) : null;
}
function Nd(e, t) {
  var n = Ki;
  return e.current.memoizedState.isDehydrated && (Pr(e, t).flags |= 256), e = Cu(e, t), e !== 2 && (t = at, at = n, t !== null && $d(t)), e;
}
function $d(e) {
  at === null ? at = e : at.push.apply(at, e);
}
function wb(e) {
  for (var t = e; ; ) {
    if (t.flags & 16384) {
      var n = t.updateQueue;
      if (n !== null && (n = n.stores, n !== null)) for (var r = 0; r < n.length; r++) {
        var o = n[r], i = o.getSnapshot;
        o = o.value;
        try {
          if (!Kt(i(), o)) return !1;
        } catch {
          return !1;
        }
      }
    }
    if (n = t.child, t.subtreeFlags & 16384 && n !== null) n.return = t, t = n;
    else {
      if (t === e) break;
      for (; t.sibling === null; ) {
        if (t.return === null || t.return === e) return !0;
        t = t.return;
      }
      t.sibling.return = t.return, t = t.sibling;
    }
  }
  return !0;
}
function Yn(e, t) {
  for (t &= ~om, t &= ~Wu, e.suspendedLanes |= t, e.pingedLanes &= ~t, e = e.expirationTimes; 0 < t; ) {
    var n = 31 - qt(t), r = 1 << n;
    e[n] = -1, t &= ~r;
  }
}
function Hh(e) {
  if (se & 6) throw Error(W(327));
  _o();
  var t = ou(e, 0);
  if (!(t & 1)) return ft(e, Ie()), null;
  var n = Cu(e, t);
  if (e.tag !== 0 && n === 2) {
    var r = od(e);
    r !== 0 && (t = r, n = Nd(e, r));
  }
  if (n === 1) throw n = fs, Pr(e, 0), Yn(e, t), ft(e, Ie()), n;
  if (n === 6) throw Error(W(345));
  return e.finishedWork = e.current.alternate, e.finishedLanes = t, wr(e, at, bn), ft(e, Ie()), null;
}
function sm(e, t) {
  var n = se;
  se |= 1;
  try {
    return e(t);
  } finally {
    se = n, se === 0 && (Ho = Ie() + 500, Vu && dr());
  }
}
function Nr(e) {
  Jn !== null && Jn.tag === 0 && !(se & 6) && _o();
  var t = se;
  se |= 1;
  var n = Ft.transition, r = ce;
  try {
    if (Ft.transition = null, ce = 1, e) return e();
  } finally {
    ce = r, Ft.transition = n, se = t, !(se & 6) && dr();
  }
}
function am() {
  gt = Eo.current, ve(Eo);
}
function Pr(e, t) {
  e.finishedWork = null, e.finishedLanes = 0;
  var n = e.timeoutHandle;
  if (n !== -1 && (e.timeoutHandle = -1, YC(n)), Fe !== null) for (n = Fe.return; n !== null; ) {
    var r = n;
    switch (zf(r), r.tag) {
      case 1:
        r = r.type.childContextTypes, r != null && lu();
        break;
      case 3:
        Wo(), ve(ct), ve(Ye), Qf();
        break;
      case 5:
        Yf(r);
        break;
      case 4:
        Wo();
        break;
      case 13:
        ve(Se);
        break;
      case 19:
        ve(Se);
        break;
      case 10:
        qf(r.type._context);
        break;
      case 22:
      case 23:
        am();
    }
    n = n.return;
  }
  if (Ae = e, Fe = e = ir(e.current, null), Ve = gt = t, Ne = 0, fs = null, om = Wu = Mr = 0, at = Ki = null, xr !== null) {
    for (t = 0; t < xr.length; t++) if (n = xr[t], r = n.interleaved, r !== null) {
      n.interleaved = null;
      var o = r.next, i = n.pending;
      if (i !== null) {
        var s = i.next;
        i.next = o, r.next = s;
      }
      n.pending = r;
    }
    xr = null;
  }
  return e;
}
function Ew(e, t) {
  do {
    var n = Fe;
    try {
      if (Wf(), Da.current = yu, gu) {
        for (var r = xe.memoizedState; r !== null; ) {
          var o = r.queue;
          o !== null && (o.pending = null), r = r.next;
        }
        gu = !1;
      }
      if (Fr = 0, _e = Me = xe = null, qi = !1, ls = 0, rm.current = null, n === null || n.return === null) {
        Ne = 1, fs = t, Fe = null;
        break;
      }
      e: {
        var i = e, s = n.return, a = n, u = t;
        if (t = Ve, a.flags |= 32768, u !== null && typeof u == "object" && typeof u.then == "function") {
          var c = u, d = a, m = d.tag;
          if (!(d.mode & 1) && (m === 0 || m === 11 || m === 15)) {
            var f = d.alternate;
            f ? (d.updateQueue = f.updateQueue, d.memoizedState = f.memoizedState, d.lanes = f.lanes) : (d.updateQueue = null, d.memoizedState = null);
          }
          var v = $h(s);
          if (v !== null) {
            v.flags &= -257, _h(v, s, a, i, t), v.mode & 1 && Nh(i, c, t), t = v, u = c;
            var h = t.updateQueue;
            if (h === null) {
              var w = /* @__PURE__ */ new Set();
              w.add(u), t.updateQueue = w;
            } else h.add(u);
            break e;
          } else {
            if (!(t & 1)) {
              Nh(i, c, t), um();
              break e;
            }
            u = Error(W(426));
          }
        } else if (ye && a.mode & 1) {
          var x = $h(s);
          if (x !== null) {
            !(x.flags & 65536) && (x.flags |= 256), _h(x, s, a, i, t), Bf(qo(u, a));
            break e;
          }
        }
        i = u = qo(u, a), Ne !== 4 && (Ne = 2), Ki === null ? Ki = [i] : Ki.push(i), i = s;
        do {
          switch (i.tag) {
            case 3:
              i.flags |= 65536, t &= -t, i.lanes |= t;
              var g = aw(i, u, t);
              Ph(i, g);
              break e;
            case 1:
              a = u;
              var p = i.type, y = i.stateNode;
              if (!(i.flags & 128) && (typeof p.getDerivedStateFromError == "function" || y !== null && typeof y.componentDidCatch == "function" && (rr === null || !rr.has(y)))) {
                i.flags |= 65536, t &= -t, i.lanes |= t;
                var C = uw(i, a, t);
                Ph(i, C);
                break e;
              }
          }
          i = i.return;
        } while (i !== null);
      }
      Iw(n);
    } catch (b) {
      t = b, Fe === n && n !== null && (Fe = n = n.return);
      continue;
    }
    break;
  } while (!0);
}
function kw() {
  var e = wu.current;
  return wu.current = yu, e === null ? yu : e;
}
function um() {
  (Ne === 0 || Ne === 3 || Ne === 2) && (Ne = 4), Ae === null || !(Mr & 268435455) && !(Wu & 268435455) || Yn(Ae, Ve);
}
function Cu(e, t) {
  var n = se;
  se |= 2;
  var r = kw();
  (Ae !== e || Ve !== t) && (bn = null, Pr(e, t));
  do
    try {
      Sb();
      break;
    } catch (o) {
      Ew(e, o);
    }
  while (!0);
  if (Wf(), se = n, wu.current = r, Fe !== null) throw Error(W(261));
  return Ae = null, Ve = 0, Ne;
}
function Sb() {
  for (; Fe !== null; ) Pw(Fe);
}
function xb() {
  for (; Fe !== null && !Hx(); ) Pw(Fe);
}
function Pw(e) {
  var t = Rw(e.alternate, e, gt);
  e.memoizedProps = e.pendingProps, t === null ? Iw(e) : Fe = t, rm.current = null;
}
function Iw(e) {
  var t = e;
  do {
    var n = t.alternate;
    if (e = t.return, t.flags & 32768) {
      if (n = pb(n, t), n !== null) {
        n.flags &= 32767, Fe = n;
        return;
      }
      if (e !== null) e.flags |= 32768, e.subtreeFlags = 0, e.deletions = null;
      else {
        Ne = 6, Fe = null;
        return;
      }
    } else if (n = mb(n, t, gt), n !== null) {
      Fe = n;
      return;
    }
    if (t = t.sibling, t !== null) {
      Fe = t;
      return;
    }
    Fe = t = e;
  } while (t !== null);
  Ne === 0 && (Ne = 5);
}
function wr(e, t, n) {
  var r = ce, o = Ft.transition;
  try {
    Ft.transition = null, ce = 1, Cb(e, t, n, r);
  } finally {
    Ft.transition = o, ce = r;
  }
  return null;
}
function Cb(e, t, n, r) {
  do
    _o();
  while (Jn !== null);
  if (se & 6) throw Error(W(327));
  n = e.finishedWork;
  var o = e.finishedLanes;
  if (n === null) return null;
  if (e.finishedWork = null, e.finishedLanes = 0, n === e.current) throw Error(W(177));
  e.callbackNode = null, e.callbackPriority = 0;
  var i = n.lanes | n.childLanes;
  if (nC(e, i), e === Ae && (Fe = Ae = null, Ve = 0), !(n.subtreeFlags & 2064) && !(n.flags & 2064) || aa || (aa = !0, Fw(ru, function() {
    return _o(), null;
  })), i = (n.flags & 15990) !== 0, n.subtreeFlags & 15990 || i) {
    i = Ft.transition, Ft.transition = null;
    var s = ce;
    ce = 1;
    var a = se;
    se |= 4, rm.current = null, vb(e, n), xw(n, e), BC(cd), iu = !!ld, cd = ld = null, e.current = n, gb(n), Kx(), se = a, ce = s, Ft.transition = i;
  } else e.current = n;
  if (aa && (aa = !1, Jn = e, xu = o), i = e.pendingLanes, i === 0 && (rr = null), Qx(n.stateNode), ft(e, Ie()), t !== null) for (r = e.onRecoverableError, n = 0; n < t.length; n++) o = t[n], r(o.value, { componentStack: o.stack, digest: o.digest });
  if (Su) throw Su = !1, e = Fd, Fd = null, e;
  return xu & 1 && e.tag !== 0 && _o(), i = e.pendingLanes, i & 1 ? e === Md ? Gi++ : (Gi = 0, Md = e) : Gi = 0, dr(), null;
}
function _o() {
  if (Jn !== null) {
    var e = ay(xu), t = Ft.transition, n = ce;
    try {
      if (Ft.transition = null, ce = 16 > e ? 16 : e, Jn === null) var r = !1;
      else {
        if (e = Jn, Jn = null, xu = 0, se & 6) throw Error(W(331));
        var o = se;
        for (se |= 4, Y = e.current; Y !== null; ) {
          var i = Y, s = i.child;
          if (Y.flags & 16) {
            var a = i.deletions;
            if (a !== null) {
              for (var u = 0; u < a.length; u++) {
                var c = a[u];
                for (Y = c; Y !== null; ) {
                  var d = Y;
                  switch (d.tag) {
                    case 0:
                    case 11:
                    case 15:
                      Hi(8, d, i);
                  }
                  var m = d.child;
                  if (m !== null) m.return = d, Y = m;
                  else for (; Y !== null; ) {
                    d = Y;
                    var f = d.sibling, v = d.return;
                    if (yw(d), d === c) {
                      Y = null;
                      break;
                    }
                    if (f !== null) {
                      f.return = v, Y = f;
                      break;
                    }
                    Y = v;
                  }
                }
              }
              var h = i.alternate;
              if (h !== null) {
                var w = h.child;
                if (w !== null) {
                  h.child = null;
                  do {
                    var x = w.sibling;
                    w.sibling = null, w = x;
                  } while (w !== null);
                }
              }
              Y = i;
            }
          }
          if (i.subtreeFlags & 2064 && s !== null) s.return = i, Y = s;
          else e: for (; Y !== null; ) {
            if (i = Y, i.flags & 2048) switch (i.tag) {
              case 0:
              case 11:
              case 15:
                Hi(9, i, i.return);
            }
            var g = i.sibling;
            if (g !== null) {
              g.return = i.return, Y = g;
              break e;
            }
            Y = i.return;
          }
        }
        var p = e.current;
        for (Y = p; Y !== null; ) {
          s = Y;
          var y = s.child;
          if (s.subtreeFlags & 2064 && y !== null) y.return = s, Y = y;
          else e: for (s = p; Y !== null; ) {
            if (a = Y, a.flags & 2048) try {
              switch (a.tag) {
                case 0:
                case 11:
                case 15:
                  Uu(9, a);
              }
            } catch (b) {
              Pe(a, a.return, b);
            }
            if (a === s) {
              Y = null;
              break e;
            }
            var C = a.sibling;
            if (C !== null) {
              C.return = a.return, Y = C;
              break e;
            }
            Y = a.return;
          }
        }
        if (se = o, dr(), cn && typeof cn.onPostCommitFiberRoot == "function") try {
          cn.onPostCommitFiberRoot(Au, e);
        } catch {
        }
        r = !0;
      }
      return r;
    } finally {
      ce = n, Ft.transition = t;
    }
  }
  return !1;
}
function Kh(e, t, n) {
  t = qo(n, t), t = aw(e, t, 1), e = nr(e, t, 1), t = et(), e !== null && (ws(e, 1, t), ft(e, t));
}
function Pe(e, t, n) {
  if (e.tag === 3) Kh(e, e, n);
  else for (; t !== null; ) {
    if (t.tag === 3) {
      Kh(t, e, n);
      break;
    } else if (t.tag === 1) {
      var r = t.stateNode;
      if (typeof t.type.getDerivedStateFromError == "function" || typeof r.componentDidCatch == "function" && (rr === null || !rr.has(r))) {
        e = qo(n, e), e = uw(t, e, 1), t = nr(t, e, 1), e = et(), t !== null && (ws(t, 1, e), ft(t, e));
        break;
      }
    }
    t = t.return;
  }
}
function bb(e, t, n) {
  var r = e.pingCache;
  r !== null && r.delete(t), t = et(), e.pingedLanes |= e.suspendedLanes & n, Ae === e && (Ve & n) === n && (Ne === 4 || Ne === 3 && (Ve & 130023424) === Ve && 500 > Ie() - im ? Pr(e, 0) : om |= n), ft(e, t);
}
function Tw(e, t) {
  t === 0 && (e.mode & 1 ? (t = Js, Js <<= 1, !(Js & 130023424) && (Js = 4194304)) : t = 1);
  var n = et();
  e = Fn(e, t), e !== null && (ws(e, t, n), ft(e, n));
}
function Eb(e) {
  var t = e.memoizedState, n = 0;
  t !== null && (n = t.retryLane), Tw(e, n);
}
function kb(e, t) {
  var n = 0;
  switch (e.tag) {
    case 13:
      var r = e.stateNode, o = e.memoizedState;
      o !== null && (n = o.retryLane);
      break;
    case 19:
      r = e.stateNode;
      break;
    default:
      throw Error(W(314));
  }
  r !== null && r.delete(t), Tw(e, n);
}
var Rw;
Rw = function(e, t, n) {
  if (e !== null) if (e.memoizedProps !== t.pendingProps || ct.current) lt = !0;
  else {
    if (!(e.lanes & n) && !(t.flags & 128)) return lt = !1, fb(e, t, n);
    lt = !!(e.flags & 131072);
  }
  else lt = !1, ye && t.flags & 1048576 && $y(t, fu, t.index);
  switch (t.lanes = 0, t.tag) {
    case 2:
      var r = t.type;
      za(e, t), e = t.pendingProps;
      var o = zo(t, Ye.current);
      $o(t, n), o = Zf(null, t, r, e, o, n);
      var i = Xf();
      return t.flags |= 1, typeof o == "object" && o !== null && typeof o.render == "function" && o.$$typeof === void 0 ? (t.tag = 1, t.memoizedState = null, t.updateQueue = null, dt(r) ? (i = !0, cu(t)) : i = !1, t.memoizedState = o.state !== null && o.state !== void 0 ? o.state : null, Kf(t), o.updater = Bu, t.stateNode = o, o._reactInternals = t, wd(t, r, e, n), t = Cd(null, t, r, !0, i, n)) : (t.tag = 0, ye && i && Vf(t), Xe(null, t, o, n), t = t.child), t;
    case 16:
      r = t.elementType;
      e: {
        switch (za(e, t), e = t.pendingProps, o = r._init, r = o(r._payload), t.type = r, o = t.tag = Ib(r), e = Bt(r, e), o) {
          case 0:
            t = xd(null, t, r, e, n);
            break e;
          case 1:
            t = Oh(null, t, r, e, n);
            break e;
          case 11:
            t = Ah(null, t, r, e, n);
            break e;
          case 14:
            t = Lh(null, t, r, Bt(r.type, e), n);
            break e;
        }
        throw Error(W(
          306,
          r,
          ""
        ));
      }
      return t;
    case 0:
      return r = t.type, o = t.pendingProps, o = t.elementType === r ? o : Bt(r, o), xd(e, t, r, o, n);
    case 1:
      return r = t.type, o = t.pendingProps, o = t.elementType === r ? o : Bt(r, o), Oh(e, t, r, o, n);
    case 3:
      e: {
        if (fw(t), e === null) throw Error(W(387));
        r = t.pendingProps, i = t.memoizedState, o = i.element, Dy(e, t), hu(t, r, null, n);
        var s = t.memoizedState;
        if (r = s.element, i.isDehydrated) if (i = { element: r, isDehydrated: !1, cache: s.cache, pendingSuspenseBoundaries: s.pendingSuspenseBoundaries, transitions: s.transitions }, t.updateQueue.baseState = i, t.memoizedState = i, t.flags & 256) {
          o = qo(Error(W(423)), t), t = jh(e, t, r, n, o);
          break e;
        } else if (r !== o) {
          o = qo(Error(W(424)), t), t = jh(e, t, r, n, o);
          break e;
        } else for (yt = tr(t.stateNode.containerInfo.firstChild), wt = t, ye = !0, Wt = null, n = Oy(t, null, r, n), t.child = n; n; ) n.flags = n.flags & -3 | 4096, n = n.sibling;
        else {
          if (Bo(), r === o) {
            t = Mn(e, t, n);
            break e;
          }
          Xe(e, t, r, n);
        }
        t = t.child;
      }
      return t;
    case 5:
      return Vy(t), e === null && vd(t), r = t.type, o = t.pendingProps, i = e !== null ? e.memoizedProps : null, s = o.children, dd(r, o) ? s = null : i !== null && dd(r, i) && (t.flags |= 32), dw(e, t), Xe(e, t, s, n), t.child;
    case 6:
      return e === null && vd(t), null;
    case 13:
      return mw(e, t, n);
    case 4:
      return Gf(t, t.stateNode.containerInfo), r = t.pendingProps, e === null ? t.child = Uo(t, null, r, n) : Xe(e, t, r, n), t.child;
    case 11:
      return r = t.type, o = t.pendingProps, o = t.elementType === r ? o : Bt(r, o), Ah(e, t, r, o, n);
    case 7:
      return Xe(e, t, t.pendingProps, n), t.child;
    case 8:
      return Xe(e, t, t.pendingProps.children, n), t.child;
    case 12:
      return Xe(e, t, t.pendingProps.children, n), t.child;
    case 10:
      e: {
        if (r = t.type._context, o = t.pendingProps, i = t.memoizedProps, s = o.value, me(mu, r._currentValue), r._currentValue = s, i !== null) if (Kt(i.value, s)) {
          if (i.children === o.children && !ct.current) {
            t = Mn(e, t, n);
            break e;
          }
        } else for (i = t.child, i !== null && (i.return = t); i !== null; ) {
          var a = i.dependencies;
          if (a !== null) {
            s = i.child;
            for (var u = a.firstContext; u !== null; ) {
              if (u.context === r) {
                if (i.tag === 1) {
                  u = In(-1, n & -n), u.tag = 2;
                  var c = i.updateQueue;
                  if (c !== null) {
                    c = c.shared;
                    var d = c.pending;
                    d === null ? u.next = u : (u.next = d.next, d.next = u), c.pending = u;
                  }
                }
                i.lanes |= n, u = i.alternate, u !== null && (u.lanes |= n), gd(
                  i.return,
                  n,
                  t
                ), a.lanes |= n;
                break;
              }
              u = u.next;
            }
          } else if (i.tag === 10) s = i.type === t.type ? null : i.child;
          else if (i.tag === 18) {
            if (s = i.return, s === null) throw Error(W(341));
            s.lanes |= n, a = s.alternate, a !== null && (a.lanes |= n), gd(s, n, t), s = i.sibling;
          } else s = i.child;
          if (s !== null) s.return = i;
          else for (s = i; s !== null; ) {
            if (s === t) {
              s = null;
              break;
            }
            if (i = s.sibling, i !== null) {
              i.return = s.return, s = i;
              break;
            }
            s = s.return;
          }
          i = s;
        }
        Xe(e, t, o.children, n), t = t.child;
      }
      return t;
    case 9:
      return o = t.type, r = t.pendingProps.children, $o(t, n), o = Mt(o), r = r(o), t.flags |= 1, Xe(e, t, r, n), t.child;
    case 14:
      return r = t.type, o = Bt(r, t.pendingProps), o = Bt(r.type, o), Lh(e, t, r, o, n);
    case 15:
      return lw(e, t, t.type, t.pendingProps, n);
    case 17:
      return r = t.type, o = t.pendingProps, o = t.elementType === r ? o : Bt(r, o), za(e, t), t.tag = 1, dt(r) ? (e = !0, cu(t)) : e = !1, $o(t, n), sw(t, r, o), wd(t, r, o, n), Cd(null, t, r, !0, e, n);
    case 19:
      return pw(e, t, n);
    case 22:
      return cw(e, t, n);
  }
  throw Error(W(156, t.tag));
};
function Fw(e, t) {
  return ry(e, t);
}
function Pb(e, t, n, r) {
  this.tag = e, this.key = n, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = r, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
}
function Rt(e, t, n, r) {
  return new Pb(e, t, n, r);
}
function lm(e) {
  return e = e.prototype, !(!e || !e.isReactComponent);
}
function Ib(e) {
  if (typeof e == "function") return lm(e) ? 1 : 0;
  if (e != null) {
    if (e = e.$$typeof, e === Tf) return 11;
    if (e === Rf) return 14;
  }
  return 2;
}
function ir(e, t) {
  var n = e.alternate;
  return n === null ? (n = Rt(e.tag, t, e.key, e.mode), n.elementType = e.elementType, n.type = e.type, n.stateNode = e.stateNode, n.alternate = e, e.alternate = n) : (n.pendingProps = t, n.type = e.type, n.flags = 0, n.subtreeFlags = 0, n.deletions = null), n.flags = e.flags & 14680064, n.childLanes = e.childLanes, n.lanes = e.lanes, n.child = e.child, n.memoizedProps = e.memoizedProps, n.memoizedState = e.memoizedState, n.updateQueue = e.updateQueue, t = e.dependencies, n.dependencies = t === null ? null : { lanes: t.lanes, firstContext: t.firstContext }, n.sibling = e.sibling, n.index = e.index, n.ref = e.ref, n;
}
function Wa(e, t, n, r, o, i) {
  var s = 2;
  if (r = e, typeof e == "function") lm(e) && (s = 1);
  else if (typeof e == "string") s = 5;
  else e: switch (e) {
    case po:
      return Ir(n.children, o, i, t);
    case If:
      s = 8, o |= 8;
      break;
    case Uc:
      return e = Rt(12, n, t, o | 2), e.elementType = Uc, e.lanes = i, e;
    case Wc:
      return e = Rt(13, n, t, o), e.elementType = Wc, e.lanes = i, e;
    case qc:
      return e = Rt(19, n, t, o), e.elementType = qc, e.lanes = i, e;
    case Vg:
      return qu(n, o, i, t);
    default:
      if (typeof e == "object" && e !== null) switch (e.$$typeof) {
        case jg:
          s = 10;
          break e;
        case Dg:
          s = 9;
          break e;
        case Tf:
          s = 11;
          break e;
        case Rf:
          s = 14;
          break e;
        case Hn:
          s = 16, r = null;
          break e;
      }
      throw Error(W(130, e == null ? e : typeof e, ""));
  }
  return t = Rt(s, n, t, o), t.elementType = e, t.type = r, t.lanes = i, t;
}
function Ir(e, t, n, r) {
  return e = Rt(7, e, r, t), e.lanes = n, e;
}
function qu(e, t, n, r) {
  return e = Rt(22, e, r, t), e.elementType = Vg, e.lanes = n, e.stateNode = { isHidden: !1 }, e;
}
function gc(e, t, n) {
  return e = Rt(6, e, null, t), e.lanes = n, e;
}
function yc(e, t, n) {
  return t = Rt(4, e.children !== null ? e.children : [], e.key, t), t.lanes = n, t.stateNode = { containerInfo: e.containerInfo, pendingChildren: null, implementation: e.implementation }, t;
}
function Tb(e, t, n, r, o) {
  this.tag = t, this.containerInfo = e, this.finishedWork = this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.pendingContext = this.context = null, this.callbackPriority = 0, this.eventTimes = Zl(0), this.expirationTimes = Zl(-1), this.entangledLanes = this.finishedLanes = this.mutableReadLanes = this.expiredLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = Zl(0), this.identifierPrefix = r, this.onRecoverableError = o, this.mutableSourceEagerHydrationData = null;
}
function cm(e, t, n, r, o, i, s, a, u) {
  return e = new Tb(e, t, n, a, u), t === 1 ? (t = 1, i === !0 && (t |= 8)) : t = 0, i = Rt(3, null, null, t), e.current = i, i.stateNode = e, i.memoizedState = { element: r, isDehydrated: n, cache: null, transitions: null, pendingSuspenseBoundaries: null }, Kf(i), e;
}
function Rb(e, t, n) {
  var r = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
  return { $$typeof: mo, key: r == null ? null : "" + r, children: e, containerInfo: t, implementation: n };
}
function Mw(e) {
  if (!e) return ur;
  e = e._reactInternals;
  e: {
    if (Or(e) !== e || e.tag !== 1) throw Error(W(170));
    var t = e;
    do {
      switch (t.tag) {
        case 3:
          t = t.stateNode.context;
          break e;
        case 1:
          if (dt(t.type)) {
            t = t.stateNode.__reactInternalMemoizedMergedChildContext;
            break e;
          }
      }
      t = t.return;
    } while (t !== null);
    throw Error(W(171));
  }
  if (e.tag === 1) {
    var n = e.type;
    if (dt(n)) return My(e, n, t);
  }
  return t;
}
function Nw(e, t, n, r, o, i, s, a, u) {
  return e = cm(n, r, !0, e, o, i, s, a, u), e.context = Mw(null), n = e.current, r = et(), o = or(n), i = In(r, o), i.callback = t ?? null, nr(n, i, o), e.current.lanes = o, ws(e, o, r), ft(e, r), e;
}
function Hu(e, t, n, r) {
  var o = t.current, i = et(), s = or(o);
  return n = Mw(n), t.context === null ? t.context = n : t.pendingContext = n, t = In(i, s), t.payload = { element: e }, r = r === void 0 ? null : r, r !== null && (t.callback = r), e = nr(o, t, s), e !== null && (Ht(e, o, s, i), ja(e, o, s)), s;
}
function bu(e) {
  if (e = e.current, !e.child) return null;
  switch (e.child.tag) {
    case 5:
      return e.child.stateNode;
    default:
      return e.child.stateNode;
  }
}
function Gh(e, t) {
  if (e = e.memoizedState, e !== null && e.dehydrated !== null) {
    var n = e.retryLane;
    e.retryLane = n !== 0 && n < t ? n : t;
  }
}
function dm(e, t) {
  Gh(e, t), (e = e.alternate) && Gh(e, t);
}
function Fb() {
  return null;
}
var $w = typeof reportError == "function" ? reportError : function(e) {
  console.error(e);
};
function fm(e) {
  this._internalRoot = e;
}
Ku.prototype.render = fm.prototype.render = function(e) {
  var t = this._internalRoot;
  if (t === null) throw Error(W(409));
  Hu(e, t, null, null);
};
Ku.prototype.unmount = fm.prototype.unmount = function() {
  var e = this._internalRoot;
  if (e !== null) {
    this._internalRoot = null;
    var t = e.containerInfo;
    Nr(function() {
      Hu(null, e, null, null);
    }), t[Rn] = null;
  }
};
function Ku(e) {
  this._internalRoot = e;
}
Ku.prototype.unstable_scheduleHydration = function(e) {
  if (e) {
    var t = cy();
    e = { blockedOn: null, target: e, priority: t };
    for (var n = 0; n < Gn.length && t !== 0 && t < Gn[n].priority; n++) ;
    Gn.splice(n, 0, e), n === 0 && fy(e);
  }
};
function mm(e) {
  return !(!e || e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11);
}
function Gu(e) {
  return !(!e || e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11 && (e.nodeType !== 8 || e.nodeValue !== " react-mount-point-unstable "));
}
function Yh() {
}
function Mb(e, t, n, r, o) {
  if (o) {
    if (typeof r == "function") {
      var i = r;
      r = function() {
        var c = bu(s);
        i.call(c);
      };
    }
    var s = Nw(t, r, e, 0, null, !1, !1, "", Yh);
    return e._reactRootContainer = s, e[Rn] = s.current, os(e.nodeType === 8 ? e.parentNode : e), Nr(), s;
  }
  for (; o = e.lastChild; ) e.removeChild(o);
  if (typeof r == "function") {
    var a = r;
    r = function() {
      var c = bu(u);
      a.call(c);
    };
  }
  var u = cm(e, 0, !1, null, null, !1, !1, "", Yh);
  return e._reactRootContainer = u, e[Rn] = u.current, os(e.nodeType === 8 ? e.parentNode : e), Nr(function() {
    Hu(t, u, n, r);
  }), u;
}
function Yu(e, t, n, r, o) {
  var i = n._reactRootContainer;
  if (i) {
    var s = i;
    if (typeof o == "function") {
      var a = o;
      o = function() {
        var u = bu(s);
        a.call(u);
      };
    }
    Hu(t, s, e, o);
  } else s = Mb(n, t, e, o, r);
  return bu(s);
}
uy = function(e) {
  switch (e.tag) {
    case 3:
      var t = e.stateNode;
      if (t.current.memoizedState.isDehydrated) {
        var n = _i(t.pendingLanes);
        n !== 0 && (Nf(t, n | 1), ft(t, Ie()), !(se & 6) && (Ho = Ie() + 500, dr()));
      }
      break;
    case 13:
      Nr(function() {
        var r = Fn(e, 1);
        if (r !== null) {
          var o = et();
          Ht(r, e, 1, o);
        }
      }), dm(e, 1);
  }
};
$f = function(e) {
  if (e.tag === 13) {
    var t = Fn(e, 134217728);
    if (t !== null) {
      var n = et();
      Ht(t, e, 134217728, n);
    }
    dm(e, 134217728);
  }
};
ly = function(e) {
  if (e.tag === 13) {
    var t = or(e), n = Fn(e, t);
    if (n !== null) {
      var r = et();
      Ht(n, e, t, r);
    }
    dm(e, t);
  }
};
cy = function() {
  return ce;
};
dy = function(e, t) {
  var n = ce;
  try {
    return ce = e, t();
  } finally {
    ce = n;
  }
};
td = function(e, t, n) {
  switch (t) {
    case "input":
      if (Gc(e, n), t = n.name, n.type === "radio" && t != null) {
        for (n = e; n.parentNode; ) n = n.parentNode;
        for (n = n.querySelectorAll("input[name=" + JSON.stringify("" + t) + '][type="radio"]'), t = 0; t < n.length; t++) {
          var r = n[t];
          if (r !== e && r.form === e.form) {
            var o = Du(r);
            if (!o) throw Error(W(90));
            Bg(r), Gc(r, o);
          }
        }
      }
      break;
    case "textarea":
      Wg(e, n);
      break;
    case "select":
      t = n.value, t != null && Ro(e, !!n.multiple, t, !1);
  }
};
Jg = sm;
Zg = Nr;
var Nb = { usingClientEntryPoint: !1, Events: [xs, yo, Du, Yg, Qg, sm] }, yi = { findFiberByHostInstance: Sr, bundleType: 0, version: "18.3.1", rendererPackageName: "react-dom" }, $b = { bundleType: yi.bundleType, version: yi.version, rendererPackageName: yi.rendererPackageName, rendererConfig: yi.rendererConfig, overrideHookState: null, overrideHookStateDeletePath: null, overrideHookStateRenamePath: null, overrideProps: null, overridePropsDeletePath: null, overridePropsRenamePath: null, setErrorHandler: null, setSuspenseHandler: null, scheduleUpdate: null, currentDispatcherRef: Nn.ReactCurrentDispatcher, findHostInstanceByFiber: function(e) {
  return e = ty(e), e === null ? null : e.stateNode;
}, findFiberByHostInstance: yi.findFiberByHostInstance || Fb, findHostInstancesForRefresh: null, scheduleRefresh: null, scheduleRoot: null, setRefreshHandler: null, getCurrentFiber: null, reconcilerVersion: "18.3.1-next-f1338f8080-20240426" };
if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
  var ua = __REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!ua.isDisabled && ua.supportsFiber) try {
    Au = ua.inject($b), cn = ua;
  } catch {
  }
}
xt.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = Nb;
xt.createPortal = function(e, t) {
  var n = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
  if (!mm(t)) throw Error(W(200));
  return Rb(e, t, null, n);
};
xt.createRoot = function(e, t) {
  if (!mm(e)) throw Error(W(299));
  var n = !1, r = "", o = $w;
  return t != null && (t.unstable_strictMode === !0 && (n = !0), t.identifierPrefix !== void 0 && (r = t.identifierPrefix), t.onRecoverableError !== void 0 && (o = t.onRecoverableError)), t = cm(e, 1, !1, null, null, n, !1, r, o), e[Rn] = t.current, os(e.nodeType === 8 ? e.parentNode : e), new fm(t);
};
xt.findDOMNode = function(e) {
  if (e == null) return null;
  if (e.nodeType === 1) return e;
  var t = e._reactInternals;
  if (t === void 0)
    throw typeof e.render == "function" ? Error(W(188)) : (e = Object.keys(e).join(","), Error(W(268, e)));
  return e = ty(t), e = e === null ? null : e.stateNode, e;
};
xt.flushSync = function(e) {
  return Nr(e);
};
xt.hydrate = function(e, t, n) {
  if (!Gu(t)) throw Error(W(200));
  return Yu(null, e, t, !0, n);
};
xt.hydrateRoot = function(e, t, n) {
  if (!mm(e)) throw Error(W(405));
  var r = n != null && n.hydratedSources || null, o = !1, i = "", s = $w;
  if (n != null && (n.unstable_strictMode === !0 && (o = !0), n.identifierPrefix !== void 0 && (i = n.identifierPrefix), n.onRecoverableError !== void 0 && (s = n.onRecoverableError)), t = Nw(t, null, e, 1, n ?? null, o, !1, i, s), e[Rn] = t.current, os(e), r) for (e = 0; e < r.length; e++) n = r[e], o = n._getVersion, o = o(n._source), t.mutableSourceEagerHydrationData == null ? t.mutableSourceEagerHydrationData = [n, o] : t.mutableSourceEagerHydrationData.push(
    n,
    o
  );
  return new Ku(t);
};
xt.render = function(e, t, n) {
  if (!Gu(t)) throw Error(W(200));
  return Yu(null, e, t, !1, n);
};
xt.unmountComponentAtNode = function(e) {
  if (!Gu(e)) throw Error(W(40));
  return e._reactRootContainer ? (Nr(function() {
    Yu(null, null, e, !1, function() {
      e._reactRootContainer = null, e[Rn] = null;
    });
  }), !0) : !1;
};
xt.unstable_batchedUpdates = sm;
xt.unstable_renderSubtreeIntoContainer = function(e, t, n, r) {
  if (!Gu(n)) throw Error(W(200));
  if (e == null || e._reactInternals === void 0) throw Error(W(38));
  return Yu(e, t, n, !1, r);
};
xt.version = "18.3.1-next-f1338f8080-20240426";
function _w() {
  if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
    try {
      __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(_w);
    } catch (e) {
      console.error(e);
    }
}
_w(), _g.exports = xt;
var _d = _g.exports, Aw, Qh = _d;
Aw = Qh.createRoot, Qh.hydrateRoot;
var _b = Object.defineProperty, Ab = (e) => e;
function Lb(e, t) {
  this[e] = Ab.bind(null, t);
}
var Lw = (e, t) => {
  for (var n in t)
    _b(e, n, {
      get: t[n],
      enumerable: !0,
      configurable: !0,
      set: Lb.bind(t, n)
    });
}, Ad = {};
Lw(Ad, {
  clampFrameToCompositionRange: () => y0,
  getFrameForComposition: () => g0,
  getInitialFrameState: () => v0,
  persistCurrentFrame: () => h0,
  useAbsoluteTimelinePosition: () => w0,
  useBuffering: () => Im,
  useIsInsideFreeze: () => Nm,
  usePlaybackRate: () => Fm,
  usePlaying: () => Pm,
  useTimelineContext: () => qr,
  useTimelinePosition: () => Hr,
  useTimelinePositionWithOptionalSubscription: () => Mm,
  useTimelineSeekFrame: () => QE,
  useTimelineSetFrameWithoutSeek: () => S0
});
var Ow = {};
Lw(Ow, {
  OBJECTFIT_CONTAIN_CLASS_NAME: () => gs,
  injectCSS: () => eT,
  makeDefaultPreviewCSS: () => tT
});
if (typeof l.createContext != "function") {
  const e = [
    'Remotion requires React.createContext, but it is "undefined".',
    'If you are in a React Server Component, turn it into a client component by adding "use client" at the top of the file.',
    "",
    "Before:",
    '  import {useCurrentFrame} from "remotion";',
    "",
    "After:",
    '  "use client";',
    '  import {useCurrentFrame} from "remotion";'
  ];
  throw new Error(e.join(`
`));
}
var fr = l.createContext(!1), Ld = ({ children: e }) => /* @__PURE__ */ S.jsx(fr.Provider, {
  value: !0,
  children: e
}), Ob = "_remotionCommitMetadata", Od = "remotion:commit-order", $r = "remotion:commit-registration-error", jw = Symbol.for("remotion.commit-order-observer-installed"), Dw = Symbol.for("remotion.commit-registration-observer-failed"), pm = () => {
  if (typeof window > "u")
    return !1;
  const e = Reflect.get(window, "__REACT_DEVTOOLS_GLOBAL_HOOK__");
  return typeof e == "object" && e !== null && Reflect.get(e, "isDisabled") !== !0 && Reflect.get(e, jw) === !0 && Reflect.get(e, Dw) !== !0;
}, Jh = (e) => `${e.type}:${e.id}`, Eu = ({
  name: e,
  parent: t
}) => [t, e].filter(Boolean).join("/"), jr = (e) => e, Qu = jr(l.createContext(null).Provider), jb = {
  metadataProp: Ob,
  eventName: Od,
  installationMarker: jw,
  failureMarker: Dw,
  registrationErrorEventName: $r
}, Ju = l.createContext(!1), Db = ({ children: e }) => /* @__PURE__ */ S.jsx(Ju.Provider, {
  value: !0,
  children: e
}), hm = ({ children: e }) => /* @__PURE__ */ S.jsx(Ju.Provider, {
  value: !1,
  children: e
}), Vb = () => {
  if (!D.useContext(Ju))
    throw new Error("This component must be inside a <Series /> component.");
}, Vw = null, zb = (e) => {
  Vw = e;
}, vm = (e) => Vw?.(e) ?? e, gm = (e) => {
  const t = D.Children.toArray(e);
  if (t.length !== 1)
    return null;
  const n = t[0];
  return D.isValidElement(n) ? n.type === hm ? gm(n.props.children) : typeof n.type != "function" && typeof n.type != "object" ? null : vm(n.type) : null;
}, zw = l.createContext(null), Zh = typeof window > "u" ? l.useEffect : l.useLayoutEffect, Bb = (e, t) => {
  if (e !== null)
    return () => {
      e.entries.delete(t), e.notifyCommit();
    };
}, Bw = (e) => {
  const t = l.useContext(zw), n = l.useRef({});
  Zh(() => {
    t !== null && (e === null ? t.entries.delete(n.current) : t.entries.set(n.current, e), t.notifyCommit());
  }, [e, t]), Zh(Bb.bind(null, t, n.current), [t]);
}, Uw = l.createContext({
  setError: () => {
  },
  clearError: () => {
  }
}), Xh = () => {
  try {
    return typeof __webpack_module__ > "u" ? null : __webpack_module__.hot ?? null;
  } catch {
    return null;
  }
};
class Ub extends D.Component {
  constructor() {
    super(...arguments);
    ue(this, "state", { hasError: !1 });
    ue(this, "hmrStatusHandler", null);
  }
  static getDerivedStateFromError() {
    return { hasError: !0 };
  }
  componentDidCatch(n) {
    this.props.onError(n), this.subscribeToHmrReset();
  }
  componentDidMount() {
    this.state.hasError || this.props.onClear();
  }
  componentDidUpdate(n, r) {
    r.hasError && !this.state.hasError && this.props.onClear();
  }
  componentWillUnmount() {
    this.unsubscribeFromHmrReset();
  }
  subscribeToHmrReset() {
    if (this.hmrStatusHandler)
      return;
    const n = Xh();
    if (!n)
      return;
    const r = (o) => {
      o === "idle" && (this.unsubscribeFromHmrReset(), this.setState({ hasError: !1 }));
    };
    this.hmrStatusHandler = r, n.addStatusHandler(r);
  }
  unsubscribeFromHmrReset() {
    const n = this.hmrStatusHandler;
    if (!n)
      return;
    this.hmrStatusHandler = null;
    const r = Xh();
    r && r.removeStatusHandler(n);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}
var Ww = (e) => `asset:${e}`, qw = {
  compositions: [],
  folders: [],
  currentCompositionMetadata: null,
  currentAssetMetadata: null,
  canvasContent: null
}, Dr = l.createContext(qw), Hw = l.createContext({ current: qw }), ym = l.createContext({
  setCanvasContent: () => {
  },
  setCurrentAssetMetadata: () => {
  },
  onlyRenderComposition: null
});
function Zo(e) {
  return !!e;
}
var Kw = () => /^([a-zA-Z0-9-\u4E00-\u9FFF])+$/g, Gw = (e) => e.match(Kw()), Wb = (e) => {
  if (e == null)
    throw new TypeError("You must pass a name to a <Folder />.");
  if (typeof e != "string")
    throw new TypeError(`The "name" you pass into <Folder /> must be a string. Got: ${typeof e}`);
  if (!Gw(e))
    throw new Error(`Folder name can only contain a-z, A-Z, 0-9 and -. You passed ${e}`);
}, qb = `Folder name must match ${String(Kw())}`, wm = l.createContext({
  folderName: null,
  parentName: null
}), Hb = jr(wm.Provider), Kb = (e) => {
  const { name: t, children: n } = e, r = l.useContext(wm), o = e._remotionInternalStack ?? null;
  Wb(t);
  const i = [r.parentName, r.folderName].filter(Zo), s = i.length === 0 ? null : i.join("/"), a = l.useMemo(() => ({
    folderName: t,
    parentName: s
  }), [t, s]), u = l.useMemo(() => ({ name: t, parent: s, order: null, stack: o }), [t, s, o]), c = l.useMemo(() => ({
    type: "folder",
    id: Eu({ name: t, parent: s }),
    value: u
  }), [t, s, u]);
  return Bw(c), /* @__PURE__ */ S.jsx(Hb, {
    value: a,
    _remotionCommitMetadata: c,
    children: n
  });
};
function ev() {
  return ["NOD", "E_EN", "V"].join("");
}
var tv = () => ["e", "nv"].join(""), ln = () => {
  const e = typeof window < "u" && window.remotion_isPlayer, t = typeof window < "u" && typeof window.process < "u" && typeof window.process.env < "u" && (window.process[tv()][ev()] === "test" || window.process[tv()][ev()] === "production" && typeof window < "u" && typeof window.remotion_puppeteerTimeout < "u"), n = typeof window < "u" && window.remotion_isStudio, r = typeof window < "u" && window.remotion_isReadOnlyStudio;
  return {
    isStudio: n,
    isRendering: t,
    isPlayer: e,
    isReadOnlyStudio: r,
    isClientSideRendering: !1
  };
}, jd = "remotion-date:", Zu = "remotion-file:", Gb = ({
  data: e,
  indent: t,
  staticBase: n
}) => {
  let r = !1, o = !1, i = !1, s = !1;
  try {
    return { serializedString: JSON.stringify(e, function(u, c) {
      const d = this[u];
      return d instanceof Date ? (r = !0, `${jd}${d.toISOString()}`) : d instanceof Map ? (i = !0, c) : d instanceof Set ? (s = !0, c) : typeof d == "string" && n !== null && n !== "" && d.startsWith(n) ? (o = !0, `${Zu}${d.replace(n + "/", "")}`) : c;
    }, t), customDateUsed: r, customFileUsed: o, mapUsed: i, setUsed: s };
  } catch (a) {
    throw new Error("Could not serialize the passed input props to JSON: " + a.message);
  }
}, Yw = (e) => {
  const t = e.replace(Zu, "");
  let n = t;
  try {
    n = t.split("/").map(decodeURIComponent).join("/");
  } catch {
  }
  const r = window.remotion_staticFiles?.find((o) => o.name === n);
  return r ? r.src : `${window.remotion_staticBase}/${t}`;
}, Qw = (e) => JSON.parse(e, (t, n) => typeof n == "string" && n.startsWith(jd) ? new Date(n.replace(jd, "")) : typeof n == "string" && n.startsWith(Zu) ? Yw(n) : n), Yb = (e) => Qw(Gb({
  data: e,
  indent: 2,
  staticBase: window.remotion_staticBase
}).serializedString), Dd = (e) => ln().isStudio ? Yb(e) : e, Jw = l.createContext(!1), Qb = ({
  children: e
}) => /* @__PURE__ */ S.jsx(Jw.Provider, {
  value: !0,
  children: e
}), Sm = () => l.useContext(Jw), qn = ({
  className: e,
  classPrefix: t,
  type: n
}) => {
  if (!e)
    return !1;
  if (n === "exact") {
    const r = e.split(" ");
    return t.some((o) => r.some((i) => i.trim() === o || i.trim().endsWith(`:${o}`) || i.trim().endsWith(`!${o}`)));
  }
  return t.some((r) => e.startsWith(r) || e.includes(` ${r}`) || e.includes(`!${r}`) || e.includes(`:${r}`));
}, Jb = (e, t) => {
  const { style: n, ...r } = e, o = l.useMemo(() => ({
    position: "absolute",
    top: qn({
      className: r.className,
      classPrefix: ["top-", "inset-"],
      type: "prefix"
    }) ? void 0 : 0,
    left: qn({
      className: r.className,
      classPrefix: ["left-", "inset-"],
      type: "prefix"
    }) ? void 0 : 0,
    right: qn({
      className: r.className,
      classPrefix: ["right-", "inset-"],
      type: "prefix"
    }) ? void 0 : 0,
    bottom: qn({
      className: r.className,
      classPrefix: ["bottom-", "inset-"],
      type: "prefix"
    }) ? void 0 : 0,
    width: qn({
      className: r.className,
      classPrefix: ["w-"],
      type: "prefix"
    }) ? void 0 : "100%",
    height: qn({
      className: r.className,
      classPrefix: ["h-"],
      type: "prefix"
    }) ? void 0 : "100%",
    display: qn({
      className: r.className,
      classPrefix: [
        "block",
        "inline-block",
        "inline",
        "flex",
        "inline-flex",
        "flow-root",
        "grid",
        "inline-grid",
        "contents",
        "list-item",
        "hidden"
      ],
      type: "exact"
    }) ? void 0 : "flex",
    flexDirection: qn({
      className: r.className,
      classPrefix: [
        "flex-row",
        "flex-col",
        "flex-row-reverse",
        "flex-col-reverse"
      ],
      type: "exact"
    }) ? void 0 : "column"
  }), [r.className]), i = l.useMemo(() => ({
    ...o,
    ...n
  }), [o, n]);
  return /* @__PURE__ */ S.jsx("div", {
    ref: t,
    style: i,
    ...r
  });
}, bs = D.memo(l.forwardRef(Jb)), vt = null, Vd = 1, qa = [], nv = () => Vd, Zb = (e) => (qa.push(e), () => {
  qa = qa.filter((t) => t !== e);
}), Xb = (e) => {
  if (Vd !== e) {
    Vd = e;
    for (const t of qa)
      t();
  }
}, zd = () => {
  if (!vt) {
    if (typeof document > "u")
      throw new Error("Tried to call an API that only works in the browser from outside the browser");
    vt = document.createElement("div"), vt.style.position = "absolute", vt.style.top = "0px", vt.style.left = "0px", vt.style.right = "0px", vt.style.bottom = "0px", vt.style.width = "100%", vt.style.height = "100%", vt.style.display = "flex", vt.style.flexDirection = "column";
    const e = document.createElement("div");
    e.style.position = "fixed", e.style.top = "-999999px", e.appendChild(vt), document.body.appendChild(e);
  }
  return vt;
}, Xu = D.createContext(null), ae = () => {
  const e = l.useContext(Xu), [t] = l.useState(() => ln());
  return e ?? t;
}, ge = l.createContext(null), Bd = () => "remotion_inputPropsOverride" + window.location.origin, Zw = () => {
  if (typeof localStorage > "u")
    return null;
  const e = localStorage.getItem(Bd());
  return e ? JSON.parse(e) : null;
}, eE = (e) => {
  if (!(typeof localStorage > "u")) {
    if (e === null) {
      localStorage.removeItem(Bd());
      return;
    }
    localStorage.setItem(Bd(), JSON.stringify(e));
  }
}, rv = !1, tE = () => {
  rv || (rv = !0, console.warn("Called `getInputProps()` on the server. This function is not available server-side and has returned an empty object."), console.warn("To hide this warning, don't call this function on the server:"), console.warn("  typeof window === 'undefined' ? {} : getInputProps()"));
}, nE = () => {
  if (typeof window > "u")
    return tE(), {};
  if (ln().isPlayer)
    throw new Error("You cannot call `getInputProps()` from a <Player>. Instead, the props are available as React props from component that you passed as `component` prop.");
  const e = Zw();
  if (e)
    return e;
  if (typeof window > "u" || typeof window.remotion_inputProps > "u")
    throw new Error("Cannot call `getInputProps()` - window.remotion_inputProps is not set. This API is only available if you are in the Studio, or while you are rendering server-side.");
  const t = window.remotion_inputProps;
  return t ? Qw(t) : {};
}, xm = l.createContext({
  props: {},
  updateProps: () => {
    throw new Error("Not implemented");
  }
}), rE = D.createRef(), Xw = ({ children: e }) => {
  const [t, n] = D.useState({}), r = l.useCallback(({
    defaultProps: i,
    id: s,
    newProps: a
  }) => {
    n((u) => ({
      ...u,
      [s]: typeof a == "function" ? a(u[s] ?? i) : a
    }));
  }, []), o = l.useMemo(() => ({ props: t, updateProps: r }), [t, r]);
  return /* @__PURE__ */ S.jsx(xm.Provider, {
    value: o,
    children: e
  });
};
function Ko(e, t, n) {
  if (typeof e != "number")
    throw new Error(`The "${t}" prop ${n} must be a number, but you passed a value of type ${typeof e}`);
  if (isNaN(e))
    throw new TypeError(`The "${t}" prop ${n} must not be NaN, but is NaN.`);
  if (!Number.isFinite(e))
    throw new TypeError(`The "${t}" prop ${n} must be finite, but is ${e}.`);
  if (e % 1 !== 0)
    throw new TypeError(`The "${t}" prop ${n} must be an integer, but is ${e}.`);
  if (e <= 0)
    throw new TypeError(`The "${t}" prop ${n} must be positive, but got ${e}.`);
}
function Vr(e, t) {
  const { allowFloats: n, component: r } = t;
  if (typeof e > "u")
    throw new Error(`The "durationInFrames" prop ${r} is missing.`);
  if (typeof e != "number")
    throw new Error(`The "durationInFrames" prop ${r} must be a number, but you passed a value of type ${typeof e}`);
  if (e <= 0)
    throw new TypeError(`The "durationInFrames" prop ${r} must be positive, but got ${e}.`);
  if (!Number.isFinite(e))
    throw new TypeError(`The "durationInFrames" prop ${r} must be finite, but got ${e}.`);
  if (!n && e % 1 !== 0)
    throw new TypeError(`The "durationInFrames" prop ${r} must be an integer, but got ${e}.`);
}
function el(e, t, n) {
  if (typeof e != "number")
    throw new Error(`"fps" must be a number, but you passed a value of type ${typeof e} ${t}`);
  if (!Number.isFinite(e))
    throw new Error(`"fps" must be a finite, but you passed ${e} ${t}`);
  if (isNaN(e))
    throw new Error(`"fps" must not be NaN, but got ${e} ${t}`);
  if (e <= 0)
    throw new TypeError(`"fps" must be positive, but got ${e} ${t}`);
}
var tl = l.createContext(null), oE = l.createRef(), iE = (e) => !!e.calculateMetadata, Cm = (e) => {
  const t = l.useContext(tl), { props: n } = l.useContext(xm), {
    compositions: r,
    canvasContent: o,
    currentCompositionMetadata: i,
    currentAssetMetadata: s
  } = l.useContext(Dr), a = o?.type === "composition" ? o.compositionId : null, u = e ?? a, c = r.find((f) => f.id === u), d = l.useMemo(() => c ? n[c.id] ?? {} : {}, [n, c]), m = ae();
  return l.useMemo(() => e === null && o?.type === "asset" && s?.asset === o.asset ? {
    type: "success",
    metadataSource: null,
    result: {
      ...s,
      id: Ww(o.asset),
      defaultProps: {}
    }
  } : c ? i ? {
    type: "success",
    metadataSource: null,
    result: {
      ...i,
      id: c.id,
      defaultProps: c.defaultProps ?? {}
    }
  } : iE(c) ? !t || !t[c.id] ? null : t[c.id] : (Vr(c.durationInFrames, {
    allowFloats: !1,
    component: `in <Composition id="${c.id}">`
  }), el(c.fps, `in <Composition id="${c.id}">`), Ko(c.width, "width", `in <Composition id="${c.id}">`), Ko(c.height, "height", `in <Composition id="${c.id}">`), {
    type: "success",
    metadataSource: null,
    result: {
      width: c.width,
      height: c.height,
      fps: c.fps,
      id: c.id,
      durationInFrames: c.durationInFrames,
      defaultProps: c.defaultProps ?? {},
      props: {
        ...c.defaultProps ?? {},
        ...d ?? {},
        ...typeof window > "u" || m.isPlayer || !window.remotion_inputProps ? {} : nE() ?? {}
      },
      defaultCodec: null,
      defaultOutName: null,
      defaultVideoImageFormat: null,
      defaultPixelFormat: null,
      defaultProResProfile: null,
      defaultSampleRate: null
    }
  }) : null, [
    c,
    o,
    t,
    s,
    i,
    e,
    d,
    m.isPlayer
  ]);
}, sE = () => null, nl = l.createContext(null), e0 = ({ children: e }) => {
  const {
    canvasContent: t,
    compositions: n,
    currentCompositionMetadata: r,
    currentAssetMetadata: o
  } = l.useContext(Dr), i = n.find((u) => t?.type === "composition" && u.id === t.compositionId), s = Cm(i?.id ?? null), a = l.useMemo(() => t?.type === "asset" && o?.asset === t.asset ? {
    ...o,
    id: Ww(t.asset),
    defaultProps: {},
    component: sE
  } : !s || s.type === "error" || s.type === "loading" || !i ? null : {
    ...s.result,
    defaultProps: i.defaultProps ?? {},
    id: i.id,
    ...r ?? {},
    component: i.component
  }, [
    t,
    o,
    r,
    s,
    i
  ]);
  return /* @__PURE__ */ S.jsx(nl.Provider, {
    value: a,
    children: e
  });
}, rl = () => l.useContext(nl), zr = () => {
  const e = l.useContext(ge), t = e?.width ?? null, n = e?.height ?? null, r = e?.durationInFrames ?? null, o = rl();
  return l.useMemo(() => {
    if (!o)
      return null;
    const {
      id: i,
      durationInFrames: s,
      fps: a,
      height: u,
      width: c,
      defaultProps: d,
      props: m,
      defaultCodec: f,
      defaultOutName: v,
      defaultVideoImageFormat: h,
      defaultPixelFormat: w,
      defaultProResProfile: x,
      defaultSampleRate: g
    } = o;
    return {
      id: i,
      width: t ?? c,
      height: n ?? u,
      fps: a,
      durationInFrames: r ?? s,
      defaultProps: d,
      props: m,
      defaultCodec: f,
      defaultOutName: v,
      defaultVideoImageFormat: h,
      defaultPixelFormat: w,
      defaultProResProfile: x,
      defaultSampleRate: g
    };
  }, [r, n, t, o]);
}, t0 = D.createContext(null), n0 = l.createContext({
  setSize: () => {
  },
  size: { size: "auto", translation: { x: 0, y: 0 } }
}), aE = ({
  canvasSize: e,
  compositionHeight: t,
  compositionWidth: n,
  previewSize: r
}) => {
  const o = e.height / t, i = e.width / n, s = Math.min(o, i);
  return r === "auto" ? s === 0 ? 1 : s : Number(r);
}, r0 = (e) => {
  const t = D.useContext(t0), n = D.useContext(n0), r = zr(), o = ae(), [i, s] = D.useState(nv);
  if (D.useEffect(() => {
    const a = () => s(nv());
    return a(), Zb(a);
  }, []), t === null || r === null || n === null) {
    if (e?.dontThrowIfOutsideOfRemotion || o.isRendering)
      return 1;
    throw new Error([
      "useCurrentScale() was called outside of a Remotion context.",
      "This hook can only be called in a component that is being rendered by Remotion.",
      "If you want to this hook to return 1 outside of Remotion, pass {dontThrowIfOutsideOfRemotion: true} as an option.",
      "If you think you called this hook in a Remotion component, make sure all versions of Remotion are aligned."
    ].join(`
`));
  }
  return t.type === "scale" ? t.scale : i;
}, uE = {
  transform: "rotate(90deg)"
}, ov = 40, lE = 14, cE = {
  color: "rgba(255, 255, 255, 0.8)",
  fontFamily: "sans-serif"
}, dE = {
  justifyContent: "center",
  alignItems: "center",
  backgroundColor: "#1f2428"
}, fE = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  animation: "anim 2s",
  animationFillMode: "forwards"
}, mE = () => {
  const e = r0({ dontThrowIfOutsideOfRemotion: !0 });
  return /* @__PURE__ */ S.jsxs(bs, {
    style: dE,
    id: "remotion-comp-loading",
    children: [
      /* @__PURE__ */ S.jsx("style", {
        type: "text/css",
        children: `
				@keyframes anim {
					from {
						opacity: 0
					}
					to {
						opacity: 1
					}
				}
			`
      }),
      /* @__PURE__ */ S.jsxs("div", {
        id: "remotion-comp-loading-content",
        style: fE,
        children: [
          /* @__PURE__ */ S.jsx("svg", {
            width: ov / e,
            height: ov / e,
            viewBox: "-100 -100 400 400",
            style: uE,
            children: /* @__PURE__ */ S.jsx("path", {
              fill: "#555",
              stroke: "#555",
              strokeWidth: "100",
              strokeLinejoin: "round",
              d: "M 2 172 a 196 100 0 0 0 195 5 A 196 240 0 0 0 100 2.259 A 196 240 0 0 0 2 172 z"
            })
          }),
          /* @__PURE__ */ S.jsxs("p", {
            style: { ...cE, fontSize: lE / e },
            children: [
              "Resolving ",
              "<Suspense>",
              "..."
            ]
          })
        ]
      })
    ]
  });
}, o0 = (e) => {
  const t = e.stack ?? "";
  return t.startsWith("Error:") ? t : `${e.message}
${t}`;
}, pE = (e) => e instanceof Error ? !0 : !(e === null || typeof e != "object" || !("stack" in e) || typeof e.stack != "string" || !("message" in e) || typeof e.message != "string");
function bm(e, t) {
  let n;
  throw pE(t) ? (n = t, n.stack || (n.stack = new Error(n.message).stack)) : typeof t == "string" ? n = Error(t) : n = Error("Rendering was cancelled"), e && (e.remotion_cancelledErrorObject = n, e.remotion_cancelledError = o0(n)), n;
}
function hE(e) {
  return bm(typeof window < "u" ? window : void 0, e);
}
var vE = "The delayRender was called:", gE = "Retries left: ", yE = "- Rendering the frame will be retried.", wE = "handle was cleared after", SE = ["trace", "verbose", "info", "warn", "error"], iv = (e) => SE.indexOf(e), ol = (e, t) => iv(e) <= iv(t), Es = ({
  args: e,
  logLevel: t,
  tag: n
}) => {
  const r = [...e];
  return ln().isRendering && !ln().isClientSideRendering && r.unshift(Symbol.for(`__remotion_level_${t}`)), n && ln().isRendering && !ln().isClientSideRendering && r.unshift(Symbol.for(`__remotion_tag_${n}`)), r;
}, xE = (e, ...t) => {
  if (ol(e.logLevel, "verbose"))
    return console.debug(...Es({ args: t, logLevel: "verbose", tag: e.tag }));
}, CE = (e, ...t) => {
  if (ol(e.logLevel, "trace"))
    return console.debug(...Es({ args: t, logLevel: "trace", tag: e.tag }));
}, bE = (e, ...t) => {
  if (ol(e.logLevel, "info"))
    return console.log(...Es({ args: t, logLevel: "info", tag: e.tag }));
}, EE = (e, ...t) => {
  if (ol(e.logLevel, "warn"))
    return console.warn(...Es({ args: t, logLevel: "warn", tag: e.tag }));
}, kE = (e, ...t) => console.error(...Es({ args: t, logLevel: "error", tag: e.tag })), Te = {
  trace: CE,
  verbose: xE,
  info: bE,
  warn: EE,
  error: kE
};
typeof window < "u" && (window.remotion_renderReady = !1, window.remotion_delayRenderTimeouts || (window.remotion_delayRenderTimeouts = {}), window.remotion_delayRenderHandles = []);
var PE = 3e4, IE = ({
  scope: e,
  environment: t,
  label: n,
  options: r
}) => {
  if (typeof n != "string" && n !== null)
    throw new Error("The label parameter of delayRender() must be a string or undefined, got: " + JSON.stringify(n));
  const o = Math.random();
  e.remotion_delayRenderHandles.push(o);
  const i = Error().stack?.replace(/^Error/g, "") ?? "";
  if (t.isRendering) {
    const s = Math.max(0, (r?.timeoutInMilliseconds ?? e.remotion_puppeteerTimeout ?? PE) - 2e3), a = (r?.retries ?? 0) - (e.remotion_attempt - 1);
    e.remotion_delayRenderTimeouts[o] = {
      label: n ?? null,
      startTime: Date.now(),
      timeout: setTimeout(() => {
        const u = [
          "A delayRender()",
          n ? `"${n}"` : null,
          `was called but not cleared after ${s}ms. See https://remotion.dev/docs/timeout for help.`,
          a > 0 ? gE + a : null,
          a > 0 ? yE : null,
          vE,
          i
        ].filter(Zo).join(" ");
        if (t.isClientSideRendering) {
          const c = Error(u);
          e.remotion_cancelledErrorObject = c, e.remotion_cancelledError = o0(c);
        } else
          bm(e, Error(u));
      }, s)
    };
  }
  return e.remotion_renderReady = !1, o;
}, TE = ({
  scope: e,
  handle: t,
  environment: n,
  logLevel: r
}) => {
  if (typeof t > "u")
    throw new TypeError("The continueRender() method must be called with a parameter that is the return value of delayRender(). No value was passed.");
  if (typeof t != "number")
    throw new TypeError("The parameter passed into continueRender() must be the return value of delayRender() which is a number. Got: " + JSON.stringify(t));
  const o = e.remotion_delayRenderHandles.includes(t), i = e.remotion_delayRenderTimeouts[t];
  if (o && n.isRendering && i) {
    const { label: s, startTime: a, timeout: u } = i;
    clearTimeout(u);
    const c = [
      s ? `"${s}"` : "A handle",
      wE,
      `${Date.now() - a}ms`
    ].filter(Zo).join(" ");
    Te.verbose({ logLevel: r, tag: "delayRender()" }, c), delete e.remotion_delayRenderTimeouts[t];
  }
  e.remotion_delayRenderHandles = e.remotion_delayRenderHandles.filter((s) => s !== t), e.remotion_delayRenderHandles.length === 0 && (e.remotion_renderReady = !0);
}, Br = l.createContext({
  logLevel: "info",
  mountTime: 0
}), Yt = () => {
  const { logLevel: e } = l.useContext(Br);
  if (e === null)
    throw new Error("useLogLevel must be used within a LogLevelProvider");
  return e;
}, ks = () => {
  const { mountTime: e } = l.useContext(Br);
  if (e === null)
    throw new Error("useMountTime must be used within a LogLevelProvider");
  return e;
}, i0 = l.createContext(null), _t = () => {
  const e = ae(), t = l.useContext(i0) ?? (typeof window < "u" ? window : void 0), n = Yt(), r = l.useCallback((s, a) => t ? IE({
    scope: t,
    environment: e,
    label: s ?? null,
    options: a ?? {}
  }) : Math.random(), [e, t]), o = l.useCallback((s) => {
    t && TE({
      scope: t,
      handle: s,
      environment: e,
      logLevel: n
    });
  }, [e, n, t]), i = l.useCallback((s) => bm(t ?? (typeof window < "u" ? window : void 0), s), [t]);
  return { delayRender: r, continueRender: o, cancelRender: i };
}, Em = (e, t) => {
  const n = Object.keys(e);
  return n.length === Object.keys(t).length && n.every((r) => Object.prototype.hasOwnProperty.call(t, r) && Object.is(Reflect.get(e, r), Reflect.get(t, r)));
}, Ud = ({
  current: e,
  entries: t,
  previousDescriptors: n,
  previousKeys: r,
  nextKeys: o,
  getKey: i,
  order: s,
  orderProperty: a
}) => {
  const u = new Map(e.map((d) => [i(d), d])), c = t.map((d) => {
    const m = i(d), f = u.get(m), v = s.get(m) ?? null;
    if (f && n.get(m) === d && f[a] === v)
      return f;
    const h = { ...d, [a]: v };
    return f && Em(f, h) ? f : h;
  });
  for (const d of e) {
    const m = i(d);
    if (!r.has(m) && !o.has(m)) {
      const f = s.get(m) ?? d[a];
      c.push(d[a] === f ? d : { ...d, [a]: f });
    }
  }
  return c.length === e.length && c.every((d, m) => d === e[m]) ? e : c;
}, il = (e) => {
  let t = e;
  const n = /* @__PURE__ */ new Set();
  return {
    getSnapshot: () => t,
    subscribe: (r) => (n.add(r), () => {
      n.delete(r);
    }),
    setSnapshot: (r) => {
      const o = r(t);
      if (o !== t) {
        t = o;
        for (const i of [...n])
          i();
      }
    }
  };
}, RE = typeof Object.is == "function" ? Object.is : (e, t) => e === t && (e !== 0 || 1 / e === 1 / t) || Number.isNaN(e) && Number.isNaN(t), wc = (e) => {
  try {
    return !RE(e.value, e.getSnapshot());
  } catch {
    return !0;
  }
}, FE = (e, t) => {
  const n = t(), [{ instance: r }, o] = l.useState({
    instance: { value: n, getSnapshot: t }
  });
  return l.useLayoutEffect(() => {
    r.value = n, r.getSnapshot = t, wc(r) && o({ instance: r });
  }, [t, r, e, n]), l.useEffect(() => (wc(r) && o({ instance: r }), e(() => {
    wc(r) && o({ instance: r });
  })), [r, e]), l.useDebugValue(n), n;
}, ME = (e, t) => t(), NE = typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u" ? ME : FE, $n = l.useSyncExternalStore ?? NE, $E = typeof window > "u" ? l.useEffect : l.useLayoutEffect, _E = (e) => (n) => {
  const r = $n(e.subscribe, e.getSnapshot, e.getSnapshot);
  return D.createElement(r, n);
}, s0 = ({
  compProps: e,
  componentName: t,
  noSuspense: n
}) => {
  const r = "component" in e ? e.component : null;
  if (r === void 0 && typeof document < "u" && !n)
    throw new Error(`A value of \`undefined\` was passed to the \`component\` prop. Check the value you are passing to the <${t}/> component.`);
  const o = "lazyComponent" in e ? e.lazyComponent : null, i = l.useMemo(() => il(r ?? null), [o]);
  $E(() => {
    r != null && i.setSnapshot(() => r);
  }, [r, i]);
  const s = _E, a = l.useMemo(s.bind(null, i), [
    i
  ]), u = l.useMemo(() => {
    if ("component" in e)
      return a;
    if ("lazyComponent" in e && typeof e.lazyComponent < "u") {
      if (typeof e.lazyComponent > "u")
        throw new Error(`A value of \`undefined\` was passed to the \`lazyComponent\` prop. Check the value you are passing to the <${t}/> component.`);
      return D.lazy(e.lazyComponent);
    }
    throw new Error("You must pass either 'component' or 'lazyComponent'");
  }, [o, i, a]);
  return "component" in e && (typeof document > "u" || n) ? e.component : u;
}, a0 = () => /^([a-zA-Z0-9-\u4E00-\u9FFF])+$/g, u0 = (e) => e.match(a0()), AE = (e) => {
  if (!u0(e))
    throw new Error(`Composition id can only contain a-z, A-Z, 0-9, CJK characters and -. You passed ${e}`);
}, LE = `Composition ID must match ${String(a0())}`, OE = (e, t, n) => {
  if (e) {
    if (typeof e != "object")
      throw new Error(`"${t}" must be an object, but you passed a value of type ${typeof e}`);
    if (Array.isArray(e))
      throw new Error(`"${t}" must be an object, an array was passed ${n ? `for composition "${n}"` : ""}`);
  }
}, jE = () => {
  const { continueRender: e, delayRender: t } = _t();
  return l.useEffect(() => {
    const n = t("Waiting for Root component to unsuspend");
    return () => e(n);
  }, [e, t]), null;
}, DE = ({
  width: e,
  height: t,
  fps: n,
  durationInFrames: r,
  id: o,
  defaultProps: i,
  schema: s,
  ...a
}) => {
  const u = rl(), c = s0({
    compProps: a,
    componentName: "Composition",
    noSuspense: !1
  }), d = Sm(), m = ae(), f = l.useContext(fr);
  if (typeof window < "u" && (window.remotion_seenCompositionIds = Array.from(/* @__PURE__ */ new Set([...window.remotion_seenCompositionIds ?? [], o]))), f)
    throw d ? new Error("<Composition> was mounted inside the `component` that was passed to the <Player>. See https://remotion.dev/docs/wrong-composition-mount for help.") : new Error("<Composition> mounted inside another composition. See https://remotion.dev/docs/wrong-composition-mount for help.");
  const { folderName: v, parentName: h } = l.useContext(wm), w = a._remotionInternalStack ?? null, x = "component" in a ? vm(a.component) : null, g = l.useMemo(() => {
    if (!o)
      throw new Error("No id for composition passed.");
    return AE(o), OE(i, "defaultProps", o), {
      durationInFrames: r ?? void 0,
      fps: n ?? void 0,
      height: t ?? void 0,
      width: e ?? void 0,
      id: o,
      folderName: v,
      component: c,
      defaultProps: Dd(i ?? {}),
      order: null,
      parentFolderName: h,
      componentFromProps: x,
      schema: s ?? null,
      calculateMetadata: a.calculateMetadata ?? null,
      stack: w
    };
  }, [
    r,
    n,
    t,
    c,
    o,
    v,
    i,
    e,
    h,
    x,
    s,
    a.calculateMetadata,
    w
  ]), p = l.useMemo(() => ({ type: "composition", id: o, value: g }), [o, g]);
  Bw(p);
  const y = Cm(o), { setError: C, clearError: b } = l.useContext(Uw), E = (k) => /* @__PURE__ */ S.jsx(Qu, {
    value: null,
    _remotionCommitMetadata: p,
    children: k
  });
  if (m.isStudio && u && u.component === c && u.id === o) {
    const k = c;
    return y === null || y.type !== "success" && y.type !== "success-and-refreshing" ? E(null) : E(_d.createPortal(/* @__PURE__ */ S.jsx(Ld, {
      children: /* @__PURE__ */ S.jsx(Ub, {
        onError: C,
        onClear: b,
        children: /* @__PURE__ */ S.jsx(l.Suspense, {
          fallback: /* @__PURE__ */ S.jsx(mE, {}),
          children: /* @__PURE__ */ S.jsx(k, {
            ...y.result.props ?? {}
          })
        })
      })
    }), zd()));
  }
  if (m.isRendering && u && u.component === c && u.id === o) {
    const k = c;
    return y === null || y.type !== "success" && y.type !== "success-and-refreshing" ? E(null) : E(_d.createPortal(/* @__PURE__ */ S.jsx(Ld, {
      children: /* @__PURE__ */ S.jsx(l.Suspense, {
        fallback: /* @__PURE__ */ S.jsx(jE, {}),
        children: /* @__PURE__ */ S.jsx(k, {
          ...y.result.props ?? {}
        })
      })
    }), zd()));
  }
  return E(null);
}, ku = (e) => {
  const { onlyRenderComposition: t } = l.useContext(ym);
  return t && t !== e.id ? null : /* @__PURE__ */ S.jsx(DE, {
    ...e
  });
}, l0 = [], c0 = null, VE = (e) => {
  c0 = e;
}, zE = () => c0, Wd = /* @__PURE__ */ new WeakMap(), d0 = "_remotionInternalStack", BE = "studio-original://", UE = /\(studio-original:\/\/([^\r\n]+):(\d+):(\d+)\)/, f0 = ({
  fileName: e,
  lineNumber: t,
  columnNumber: n
}) => `Error
    at remotionOriginalSource (${BE}${encodeURIComponent(e)}:${t}:${n})`, WE = (e) => {
  if (!e)
    return null;
  const t = e.match(UE);
  return t ? {
    fileName: decodeURIComponent(t[1]),
    line: Number(t[2]),
    column: Number(t[3])
  } : null;
}, m0 = () => l0, Le = (e) => {
  l0.push(e);
}, sv = (e, t) => {
  if (t === void 0) {
    Wd.delete(e);
    return;
  }
  Wd.set(e, t);
}, sl = (e) => Wd.get(e) ?? null, Li = "4.0.539", qE = () => {
  if (typeof globalThis > "u")
    return;
  const e = () => {
    globalThis.remotion_imported = Li, typeof window < "u" && (window.remotion_imported = Li);
  }, t = globalThis.remotion_imported || typeof window < "u" && window.remotion_imported;
  if (t) {
    if (t === Li)
      return;
    if (typeof t == "string" && t.includes("webcodecs")) {
      e();
      return;
    }
    throw new TypeError(`🚨 Multiple versions of Remotion detected: ${[
      Li,
      typeof t == "string" ? t : "an older version"
    ].filter(Zo).join(" and ")}. This will cause things to break in an unexpected way.
Check that all your Remotion packages are on the same version. If your dependencies depend on Remotion, make them peer dependencies. You can also run \`npx remotion versions\` from your terminal to see which versions are mismatching.`);
  }
  e();
}, HE = !1, Ps = (e) => e ?? HE, KE = 0, Ur = l.createContext(KE), Is = 1 / 0, Ts = l.createContext(!1), Gt = l.createContext(!1), al = l.createContext(!1), ul = l.createContext(null), ms = l.createContext(null), qd = l.createContext(null), Wr = ({ children: e }) => l.useContext(Gt) ? null : e, ps = (e) => {
  let t = e;
  const n = /* @__PURE__ */ new Set();
  return {
    store: {
      getSnapshot: () => t,
      subscribe: (o) => (n.add(o), () => {
        n.delete(o);
      })
    },
    setSnapshot: (o) => {
      if (t !== o) {
        t = o;
        for (const i of n)
          i(t);
      }
    }
  };
}, p0 = (e) => {
  const t = l.useRef(0), n = l.useRef(/* @__PURE__ */ new Set());
  return l.useMemo(() => ({
    revision: t,
    seekFrame: (r) => {
      t.current++;
      for (const o of n.current)
        o();
      e(r);
    },
    subscribe: (r) => (n.current.add(r), () => {
      n.current.delete(r);
    })
  }), [e]);
}, la = () => {
  throw new Error("SetTimelineContext is missing. This is likely caused by a Remotion version mismatch.");
}, Qt = l.createContext({
  seek: null,
  setFrameWithoutSeek: la,
  setPlaying: la,
  setBuffering: la,
  subscribePlaying: () => () => {
  },
  subscribeBuffering: () => () => {
  },
  isPlaying: () => !1,
  isBuffering: la,
  frameRef: { current: {} },
  audioAndVideoTags: { current: [] }
}), mn = l.createContext(null), km = l.createContext(null), hs = l.createContext(null), GE = ({ children: e, frameState: t }) => {
  const n = l.useMemo(() => ps({ playing: !1 }), []), r = l.useMemo(() => ps({ buffering: !1 }), []), [o, i] = l.useState(1), s = l.useRef([]), [a, u] = l.useState(() => v0()), c = p0(u), { isStudio: d } = ae(), m = d ? c : null, f = t ?? a, v = l.useRef(f);
  v.current = f;
  const h = l.useCallback(() => n.store.getSnapshot().playing, [n]), w = l.useCallback(() => r.store.getSnapshot().buffering, [r]), { delayRender: x, continueRender: g } = _t();
  typeof window < "u" && l.useLayoutEffect(() => {
    window.remotion_setFrame = (b, E, k) => {
      window.remotion_attempt = k;
      const P = x(`Setting the current frame to ${b}`);
      let F = !0;
      u((I) => (I[E] ?? window.remotion_initialFrame) === b ? (F = !1, I) : {
        ...I,
        [E]: b
      }), F ? requestAnimationFrame(() => g(P)) : g(P);
    }, window.remotion_isPlayer = !1;
  }, [g, x]);
  const p = l.useMemo(() => ({
    frame: f,
    isPlaying: h,
    isInsideFreeze: !1,
    audioAndVideoTags: s
  }), [f, h]), y = l.useMemo(() => ({
    playbackRate: o,
    setPlaybackRate: i
  }), [o]), C = l.useMemo(() => ({
    setFrameWithoutSeek: u,
    seek: m,
    setPlaying: (b) => {
      const E = n.store.getSnapshot().playing, k = typeof b == "function" ? b(E) : b;
      E !== k && n.setSnapshot({ playing: k });
    },
    setBuffering: (b) => {
      w() !== b && r.setSnapshot({ buffering: b });
    },
    subscribePlaying: n.store.subscribe,
    subscribeBuffering: r.store.subscribe,
    isPlaying: h,
    isBuffering: w,
    frameRef: v,
    audioAndVideoTags: s
  }), [r, n, w, h, m]);
  return /* @__PURE__ */ S.jsx(hs.Provider, {
    value: p,
    children: /* @__PURE__ */ S.jsx(km.Provider, {
      value: y,
      children: /* @__PURE__ */ S.jsx(mn.Provider, {
        value: p,
        children: /* @__PURE__ */ S.jsx(Qt.Provider, {
          value: C,
          children: e
        })
      })
    })
  });
}, Pm = () => {
  const { isPlaying: e } = qr(), { subscribePlaying: t } = l.useContext(Qt);
  return $n(t, e, e);
}, Im = () => {
  const { isBuffering: e, subscribeBuffering: t } = l.useContext(Qt);
  return $n(t, e, e);
}, YE = l.createContext(null), Tm = () => "remotion.time-all", h0 = (e) => {
  localStorage.setItem(Tm(), JSON.stringify(e));
}, v0 = () => {
  const e = localStorage.getItem(Tm()) ?? "{}";
  return JSON.parse(e);
}, g0 = (e) => {
  const t = localStorage.getItem(Tm()) ?? "{}", n = JSON.parse(t);
  return n[e] !== void 0 ? Number(n[e]) : typeof window > "u" ? 0 : window.remotion_initialFrame ?? 0;
}, y0 = (e, t) => Math.max(0, Math.min(Math.max(0, t - 1), e)), Rm = (e) => {
  const t = rl(), n = ae(), r = l.useContext(Gt);
  if (e === null)
    return 0;
  if (!t)
    return typeof window > "u" ? 0 : window.remotion_initialFrame ?? 0;
  const o = e.frame[t.id] ?? (n.isPlayer ? 0 : g0(t.id));
  return r ? o : y0(o, t.durationInFrames);
}, qr = () => {
  const e = l.useContext(Gt), t = l.useContext(e ? ms : mn);
  if (t === null)
    throw new Error("TimelineContext is not available. This hook must be used inside a <Player> or the Remotion Studio.");
  return t;
}, Fm = () => {
  const e = l.useContext(km);
  if (e === null)
    throw new Error("PlaybackRateContext is not available. This hook must be used inside a <Player> or the Remotion Studio.");
  return e;
}, Hr = () => {
  const e = qr();
  return Rm(e);
}, Mm = (e) => {
  const t = l.useContext(Gt), n = l.useContext(e ? t ? ms : mn : YE), r = Rm(n);
  if (e && n === null)
    throw new Error("TimelineContext is not available. This hook must be used inside a <Player> or the Remotion Studio.");
  return r;
}, Nm = () => qr().isInsideFreeze, w0 = () => {
  const e = l.useContext(Gt), t = l.useContext(e ? qd : hs);
  if (t === null)
    throw new Error("AbsoluteTimeContext is not available. This hook must be used inside a <Player> or the Remotion Studio.");
  return Rm(t);
}, S0 = () => {
  const { setFrameWithoutSeek: e } = l.useContext(Qt);
  return e;
}, QE = () => {
  const { seek: e, setFrameWithoutSeek: t } = l.useContext(Qt);
  return e?.seekFrame ?? t;
}, ll = (e) => {
  const t = l.useContext(fr), n = ae();
  if (!t)
    throw n.isPlayer ? new Error("useCurrentFrame can only be called inside a component that was passed to <Player>. See: https://www.remotion.dev/docs/player/examples") : new Error("useCurrentFrame() can only be called inside a component that was registered as a composition. See https://www.remotion.dev/docs/the-fundamentals#defining-compositions");
  const r = Mm(e), o = l.useContext(ge);
  if (!e)
    return 0;
  const i = o ? o.cumulatedFrom + o.relativeFrom : 0;
  return (r - i) * (o?.playbackRate ?? 1);
}, hn = () => ll(!0), bt = () => {
  const e = zr(), t = l.useContext(fr), n = Sm();
  if (!e)
    throw typeof window < "u" && window.remotion_isPlayer || n ? new Error([
      "No video config found. Likely reasons:",
      "- You are probably calling useVideoConfig() from outside the component passed to <Player />. See https://www.remotion.dev/docs/player/examples for how to set up the Player correctly.",
      "- You have multiple versions of Remotion installed which causes the React context to get lost."
    ].join("-")) : new Error("No video config found. You are probably calling useVideoConfig() from a component which has not been registered as a <Composition />. See https://www.remotion.dev/docs/the-fundamentals#defining-compositions for more information.");
  if (!t)
    throw new Error("Called useVideoConfig() outside a Remotion composition.");
  return e;
}, x0 = l.createContext(!1), $m = () => l.useContext(x0), vn = ({
  frame: e,
  children: t,
  active: n = !0,
  _remotionInternalIsPremounting: r = !1
}) => {
  const o = hn(), i = bt();
  if (typeof e > "u")
    throw new Error("The <Freeze /> component requires a 'frame' prop, but none was passed.");
  if (typeof e != "number")
    throw new Error(`The 'frame' prop of <Freeze /> must be a number, but is of type ${typeof e}`);
  if (Number.isNaN(e))
    throw new Error("The 'frame' prop of <Freeze /> must be a real number, but it is NaN.");
  if (!Number.isFinite(e))
    throw new Error(`The 'frame' prop of <Freeze /> must be a finite number, but it is ${e}.`);
  const s = l.useMemo(() => {
    if (typeof n == "boolean")
      return n;
    if (typeof n == "function")
      return n(o);
  }, [n, o]), a = qr(), u = l.useContext(Gt), c = l.useContext(ge), d = $m(), m = c?.relativeFrom ?? 0, f = c?.playbackRate ?? 1, { audioAndVideoTags: v } = a, h = l.useMemo(() => ({
    audioAndVideoTags: v,
    isPlaying: () => !1,
    isInsideFreeze: !0,
    frame: {
      [i.id]: e / f + m
    }
  }), [
    v,
    i.id,
    e,
    m,
    f
  ]), w = l.useMemo(() => c ? s ? {
    ...c,
    cumulatedFrom: 0
  } : c : null, [c, s]), x = s ? h : a;
  return /* @__PURE__ */ S.jsx(x0.Provider, {
    value: d || !!s && !r,
    children: /* @__PURE__ */ S.jsx(mn.Provider, {
      value: x,
      children: /* @__PURE__ */ S.jsx(ms.Provider, {
        value: u ? x : null,
        children: /* @__PURE__ */ S.jsx(ge.Provider, {
          value: w,
          children: t
        })
      })
    })
  });
}, C0 = ({
  absoluteFrame: e,
  cumulatedFrom: t,
  from: n,
  parentPlaybackRate: r,
  durationInFrames: o
}) => Math.min(o / 2, Number.EPSILON * Math.max(Math.abs(e * r), Math.abs(t * r), Math.abs(n)) * 4), JE = {
  captions: {
    type: "remotion-captions",
    default: void 0,
    description: "Captions",
    keyframable: !1
  }
}, At = {
  "style.transformOrigin": {
    type: "transform-origin",
    step: 1,
    default: "50% 50%",
    description: "Transform origin"
  },
  "style.translate": {
    type: "translate",
    step: 1,
    default: "0px 0px",
    description: "Offset"
  },
  "style.scale": {
    type: "scale",
    max: 100,
    step: 0.01,
    default: 1,
    description: "Scale",
    defaultKeyframeOutput: "perceptual-scale"
  },
  "style.rotate": {
    type: "rotation-css",
    step: 1,
    default: "0deg",
    description: "Rotation"
  },
  "style.opacity": {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 1,
    description: "Opacity",
    hiddenFromList: !1
  }
}, ZE = At, Rs = {
  "style.color": {
    type: "color",
    default: void 0,
    description: "Color"
  },
  "style.fontFamily": {
    type: "font-family",
    default: void 0,
    description: "Font family",
    keyframable: !1
  },
  "style.fontSize": {
    type: "number",
    default: void 0,
    min: 0,
    step: 1,
    description: "Font size",
    hiddenFromList: !1
  },
  "style.lineHeight": {
    type: "number",
    default: void 0,
    min: 0,
    step: 0.05,
    description: "Line height",
    hiddenFromList: !1
  },
  "style.fontWeight": {
    type: "font-weight",
    default: 400,
    description: "Font weight"
  },
  "style.fontStyle": {
    type: "enum",
    default: "normal",
    description: "Font style",
    variants: {
      normal: {},
      italic: {},
      oblique: {}
    }
  },
  "style.textAlign": {
    type: "enum",
    default: "left",
    description: "Text align",
    variants: {
      left: {},
      center: {},
      right: {},
      justify: {},
      start: {},
      end: {}
    }
  },
  "style.letterSpacing": {
    type: "number",
    default: void 0,
    step: 0.1,
    description: "Letter spacing",
    hiddenFromList: !1
  }
}, _n = {
  "style.borderWidth": {
    type: "number",
    default: void 0,
    min: 0,
    step: 1,
    description: "Border width",
    hiddenFromList: !1
  },
  "style.borderStyle": {
    type: "enum",
    default: "none",
    description: "Border style",
    variants: {
      none: {},
      hidden: {},
      solid: {},
      dashed: {},
      dotted: {},
      double: {},
      groove: {},
      ridge: {},
      inset: {},
      outset: {}
    }
  },
  "style.borderColor": {
    type: "color",
    default: void 0,
    description: "Border color"
  }
}, An = {
  "style.borderRadius": {
    type: "number",
    default: 0,
    min: 0,
    step: 1,
    description: "Border radius",
    hiddenFromList: !1,
    keyframable: !0
  },
  "style.borderTopLeftRadius": {
    type: "number",
    default: 0,
    min: 0,
    step: 1,
    description: "Top left radius",
    hiddenFromList: !1
  },
  "style.borderTopRightRadius": {
    type: "number",
    default: 0,
    min: 0,
    step: 1,
    description: "Top right radius",
    hiddenFromList: !1
  },
  "style.borderBottomRightRadius": {
    type: "number",
    default: 0,
    min: 0,
    step: 1,
    description: "Bottom right radius",
    hiddenFromList: !1
  },
  "style.borderBottomLeftRadius": {
    type: "number",
    default: 0,
    min: 0,
    step: 1,
    description: "Bottom left radius",
    hiddenFromList: !1
  }
}, Ln = {
  "style.backgroundColor": {
    type: "color",
    default: "transparent",
    description: "Color"
  }
}, XE = {
  color: {
    type: "color",
    default: void 0,
    description: "Current color"
  }
}, _m = {
  ...XE,
  stroke: {
    type: "color",
    default: "none",
    description: "Stroke"
  },
  strokeWidth: {
    type: "number",
    default: 1,
    description: "Stroke width",
    min: 0,
    step: 1,
    hiddenFromList: !1
  }
}, cl = {
  fill: {
    type: "color",
    default: void 0,
    description: "Fill"
  },
  ..._m
}, dl = {
  children: {
    type: "string",
    default: "",
    description: "Text",
    keyframable: !1
  }
}, Jt = {
  premountFor: {
    type: "number",
    default: void 0,
    description: "Premount For",
    min: 0,
    step: 1,
    hiddenFromList: !1,
    keyframable: !1
  },
  postmountFor: {
    type: "number",
    default: 0,
    min: 0,
    step: 1,
    hiddenFromList: !0,
    keyframable: !1
  }
}, b0 = {
  ...Jt
}, On = {
  cropLeft: {
    type: "number",
    default: 0,
    description: "Crop left",
    min: 0,
    max: 1,
    step: 0.01,
    hiddenFromList: !1,
    keyframable: !0
  },
  cropRight: {
    type: "number",
    default: 0,
    description: "Crop right",
    min: 0,
    max: 1,
    step: 0.01,
    hiddenFromList: !1,
    keyframable: !0
  },
  cropTop: {
    type: "number",
    default: 0,
    description: "Crop top",
    min: 0,
    max: 1,
    step: 0.01,
    hiddenFromList: !1,
    keyframable: !0
  },
  cropBottom: {
    type: "number",
    default: 0,
    description: "Crop bottom",
    min: 0,
    max: 1,
    step: 0.01,
    hiddenFromList: !1,
    keyframable: !0
  }
}, E0 = On, k0 = {
  ...E0,
  ...At,
  ...Ln,
  ..._n,
  ...An,
  ...b0
}, fl = {
  type: "boolean",
  default: !1,
  description: "Hidden"
}, Am = {
  type: "hidden"
}, ml = {
  type: "hidden"
}, ek = (e) => ({
  name: ml,
  ...e
}), Fs = {
  type: "number",
  default: void 0,
  min: 1,
  step: 1,
  hiddenFromList: !0
}, pl = {
  type: "number",
  default: 0,
  step: 1,
  hiddenFromList: !0
}, hl = {
  type: "number",
  default: 0,
  min: 0,
  step: 1,
  hiddenFromList: !0
}, Lm = {
  from: {
    ...pl,
    description: "From",
    hiddenFromList: !1,
    keyframable: !1
  },
  durationInFrames: {
    ...Fs,
    description: "Duration",
    hiddenFromList: !1,
    keyframable: !1
  },
  trimBefore: {
    ...hl,
    description: "Trim before",
    hiddenFromList: !1,
    keyframable: !1
  }
}, tk = {
  type: "number",
  default: void 0,
  min: 1,
  step: 1,
  hiddenFromList: !0
}, nk = {
  type: "boolean",
  default: !1,
  description: "Loop",
  keyframable: !1
}, vl = {
  type: "number",
  default: null,
  step: 1,
  hiddenFromList: !0
}, P0 = {
  type: "number",
  default: 1,
  min: 0.01,
  step: 0.1,
  description: "Playback rate",
  hiddenFromList: !1,
  keyframable: !1
}, jn = {
  durationInFrames: Fs,
  from: pl,
  trimBefore: hl,
  playbackRate: P0,
  freeze: vl,
  hidden: fl,
  name: ml,
  showInTimeline: Am
}, I0 = {
  durationInFrames: Fs,
  from: pl,
  trimBefore: hl,
  freeze: vl,
  hidden: fl,
  name: ml,
  showInTimeline: Am
}, _r = {
  ...jn,
  layout: {
    type: "enum",
    default: "absolute-fill",
    description: "Layout",
    variants: {
      "absolute-fill": k0,
      none: {}
    }
  }
}, rk = {
  durationInFrames: Fs,
  trimBefore: hl,
  playbackRate: P0,
  freeze: vl,
  hidden: fl,
  name: ml,
  showInTimeline: Am
}, ok = {
  ...rk,
  layout: _r.layout
}, ik = {
  ..._r,
  layout: {
    ..._r.layout,
    default: "none"
  }
}, Om = l.createContext(null), T0 = ({
  durationInFrames: e
}) => e ?? 1 / 0, Zt = ({
  durationInFrames: e,
  playbackRate: t,
  loop: n
}) => n ? 1 / 0 : T0({
  durationInFrames: e
}) / (t ?? 1), av = (e) => Math.min(1, Math.max(0, e ?? 0)), uv = (e, t) => {
  const n = av(e), r = av(t);
  return n + r > 1 ? [0.5, 0.5] : [n, r];
}, jm = ({
  cropLeft: e,
  cropRight: t,
  cropTop: n,
  cropBottom: r
}) => {
  const [o, i] = uv(e, t), [s, a] = uv(n, r);
  return { left: o, right: i, top: s, bottom: a };
}, R0 = ({
  left: e,
  right: t,
  top: n,
  bottom: r,
  style: o
}) => {
  if (e === 0 && t === 0 && n === 0 && r === 0)
    return null;
  const i = (d) => typeof d == "number" ? `${d}px` : d, s = i(o?.borderRadius), a = [
    o?.borderTopLeftRadius,
    o?.borderTopRightRadius,
    o?.borderBottomRightRadius,
    o?.borderBottomLeftRadius
  ], u = s || (a.some((d) => d !== void 0) ? a.map((d) => i(d) ?? "0px").join(" ") : void 0), c = u ? ` round ${u}` : "";
  return `inset(${n * 100}% ${t * 100}% ${r * 100}% ${e * 100}%${c})`;
}, F0 = (e, t = "<Sequence />") => {
  for (const [n, r] of Object.entries(e))
    if (r !== void 0) {
      if (typeof r != "number" || !Number.isFinite(r))
        throw new TypeError(`The "${n}" prop of ${t} must be a finite number, but got ${String(r)}.`);
      if (r > 100)
        throw new RangeError(`The "${n}" prop of ${t} must be between 0 and 1, but got ${r}. The crop range is 0 to 1, not 0 to 100.`);
    }
}, Dm = D.createContext(!1), ca = /* @__PURE__ */ new WeakMap(), Vm = {
  createRef: () => {
    const e = { current: null };
    return ca.set(e, []), e;
  },
  getNodes: (e) => ca.get(e) ?? null,
  setNodes: (e, t) => {
    const n = ca.get(e);
    n?.length === t.length && n.every((r, o) => r === t[o]) || (e.current = t.length === 1 && t[0].nodeType === 1 ? t[0] : null, ca.set(e, t));
  }
}, sk = { then: () => {
} }, ak = ({ children: e, dormant: t }) => {
  const n = l.useContext(al);
  if (t && n)
    throw sk;
  return e;
}, Hd = (e, t) => {
  if (Object.is(e, t))
    return !0;
  if (Array.isArray(e) && Array.isArray(t))
    return e.length === t.length && e.every((r, o) => Hd(r, t[o]));
  if (!D.isValidElement(e) || !D.isValidElement(t) || e.type !== t.type || e.key !== t.key)
    return !1;
  const n = Object.keys(e.props);
  return n.length === Object.keys(t.props).length && n.every((r) => Object.prototype.hasOwnProperty.call(t.props, r) && (r === "children" ? Hd(e.props.children, t.props.children) : Object.is(e.props[r], t.props[r])));
}, uk = D.memo(({ children: e }) => e, (e, t) => e.dormant && t.dormant && Hd(e.children, t.children)), lk = ({ children: e, dormant: t, frame: n }) => {
  const r = l.useContext(Gt), o = l.useContext(r ? ms : mn), i = l.useContext(r ? qd : hs), { id: s } = bt();
  if (o === null)
    throw new Error("TimelineContext is missing");
  const { audioAndVideoTags: a } = o, u = l.useMemo(() => ({
    frame: { [s]: n },
    isPlaying: () => !1,
    isInsideFreeze: !0,
    audioAndVideoTags: a
  }), [a, n, s]);
  return /* @__PURE__ */ S.jsx(Gt.Provider, {
    value: t,
    children: /* @__PURE__ */ S.jsx(ms.Provider, {
      value: t ? u : null,
      children: /* @__PURE__ */ S.jsx(qd.Provider, {
        value: t ? u : null,
        children: /* @__PURE__ */ S.jsx(mn.Provider, {
          value: t ? u : o,
          children: /* @__PURE__ */ S.jsx(hs.Provider, {
            value: t ? u : i,
            children: /* @__PURE__ */ S.jsx(D.Activity, {
              mode: t && !r ? "hidden" : "visible",
              children: /* @__PURE__ */ S.jsx(ak, {
                dormant: t,
                children: e
              })
            })
          })
        })
      })
    })
  });
}, M0 = D.useInsertionEffect ?? D.useLayoutEffect, ck = () => {
  const e = il(/* @__PURE__ */ new Set()), t = /* @__PURE__ */ new Map();
  let n = {}, r = Is, o = !1, i = !1;
  const s = () => {
    o || i || (o = !0, queueMicrotask(() => {
      if (o = !1, i)
        return;
      const a = [...t.values()].filter((c) => c.end > c.from).map((c) => {
        const d = n[c.compositionId] ?? 0;
        return {
          candidate: c,
          distance: Math.max(0, c.from - d, d - c.end)
        };
      }).sort((c, d) => c.distance - d.distance), u = /* @__PURE__ */ new Set();
      for (const { candidate: c } of a) {
        const d = [];
        let m = c;
        for (; m && !u.has(m.id) && (d.push(m.id), !(u.size + d.length > r)); )
          m = m.parent === null ? void 0 : t.get(m.parent);
        if (!(u.size + d.length > r)) {
          for (const f of d)
            u.add(f);
          if (u.size === r)
            break;
        }
      }
      e.setSnapshot((c) => c.size === u.size && [...c].every((d) => u.has(d)) ? c : u);
    }));
  };
  return {
    ...e,
    setSuspended: (a) => {
      i !== a && (i = a, s());
    },
    setLimit: (a) => {
      r !== a && (r = a, s());
    },
    setFrame: (a) => {
      n = a, s();
    },
    register: (a) => (t.set(a.id, a), s(), () => {
      t.delete(a.id), s();
    })
  };
}, N0 = l.createContext(null), dk = l.createContext(null), $0 = /* @__PURE__ */ new Set(), _0 = l.createContext($0), fk = ({ children: e }) => {
  const t = l.useContext(Ts), n = l.useContext(ul), r = l.useContext(al), o = n?.limit ?? Is, i = t && o > 0 && o !== 1 / 0, [s] = l.useState(ck), a = l.useContext(i && !r ? mn : dk), u = $n(s.subscribe, s.getSnapshot, s.getSnapshot), c = l.useMemo(() => i ? u.size > o ? new Set([...u].slice(0, o)) : u : $0, [i, o, u]);
  return M0(() => {
    s.setSuspended(r), s.setLimit(i ? o : 0), i && a !== null && s.setFrame(a.frame);
  }, [i, s, o, r, a]), /* @__PURE__ */ S.jsx(N0.Provider, {
    value: i ? s : null,
    children: /* @__PURE__ */ S.jsx(_0.Provider, {
      value: c,
      children: e
    })
  });
}, mk = (e) => {
  const t = l.useContext(N0), n = l.useContext(Ts), r = l.useContext(ul), o = n && (r?.limit ?? Is) === 1 / 0, i = l.useContext(_0), s = e?.id ?? null, a = e?.parent ?? null, u = e?.compositionId ?? null, c = e?.from ?? null, d = e?.end ?? null, m = l.useMemo(() => s !== null && u !== null && c !== null && d !== null ? { id: s, parent: a, compositionId: u, from: c, end: d } : null, [s, a, u, c, d]);
  return M0(() => {
    if (t !== null && m !== null)
      return t.register(m);
  }, [t, m]), s !== null && (o || i.has(s));
}, pk = {
  registerSequence: () => {
    throw new Error("SequenceManagerActionsContext not initialized");
  },
  updateSequence: () => {
    throw new Error("SequenceManagerActionsContext not initialized");
  },
  unregisterSequence: () => {
    throw new Error("SequenceManagerActionsContext not initialized");
  }
}, mr = D.createContext(pk), Ms = D.createContext(null), hk = () => () => {
}, vk = [], lv = () => vk, gl = D.createContext(!1), zm = D.createContext(null), gk = () => {
  const e = l.useContext(Ms);
  return $n(e?.subscribe ?? hk, e?.getSnapshot ?? lv, e?.getSnapshot ?? lv);
}, yl = D.createContext({
  current: []
}), Xo = D.createContext(!1), wl = D.createContext(!1), yk = ({ children: e }) => D.createElement(wl.Provider, { value: !0 }, e), wk = ({ children: e }) => {
  const t = l.useContext(Ts), { isPlaying: n, subscribePlaying: r, seek: o } = l.useContext(Qt), [i, s] = l.useState(!1);
  return l.useEffect(() => {
    if (!t) {
      s(!1);
      return;
    }
    let a = null;
    const u = () => {
      s(n() || a !== null);
    }, c = r(u), d = o?.subscribe(() => {
      s(!0), a !== null && clearTimeout(a), a = setTimeout(() => {
        a = null, u();
      }, 150);
    });
    return u(), () => {
      c(), d?.(), a !== null && clearTimeout(a);
    };
  }, [t, n, o, r]), /* @__PURE__ */ S.jsx(al.Provider, {
    value: i,
    children: e
  });
}, Sk = typeof window > "u" ? D.useEffect : D.useLayoutEffect, xk = jr(yl.Provider), Ck = ({ children: e }) => {
  const { isStudio: t } = ae(), n = Yt(), r = l.useContext(Xo), o = t || r, [i] = l.useState(() => String(Math.random())), [s, a] = l.useState(() => o && pm()), u = l.useRef(!1), c = l.useRef(!1), d = l.useRef(/* @__PURE__ */ new Set()), m = l.useRef(/* @__PURE__ */ new Map()), f = l.useRef(/* @__PURE__ */ new Map()), v = l.useRef(/* @__PURE__ */ new Map([
    [i, { sequences: [], sequenceIds: [] }]
  ])), h = l.useRef(!1), w = l.useRef(!1), x = l.useRef(null), g = l.useRef(null), [p] = l.useState(() => il([])), y = p.setSnapshot, C = l.useMemo(() => ({
    get current() {
      return p.getSnapshot();
    }
  }), [p]), b = l.useCallback((O, N, j) => {
    if (h.current || w.current)
      return;
    const V = f.current.get(O) ?? v.current.get(O);
    if (V?.sequences === N && V.sequenceIds === j)
      return;
    const B = f.current.size > 0;
    f.current.set(O, {
      sequences: N,
      sequenceIds: j
    }), !B && queueMicrotask(() => {
      const A = f.current;
      if (f.current = /* @__PURE__ */ new Map(), A.size === 0 || h.current || w.current)
        return;
      const T = d.current, M = m.current;
      for (const [U, K] of A)
        U !== i && K.sequenceIds.length === 0 ? v.current.delete(U) : v.current.set(U, K);
      const R = [...v.current.values()], $ = R.flatMap((U) => U.sequences), z = R.flatMap((U) => U.sequenceIds);
      m.current = new Map($.map((U) => [U.id, U]));
      const q = new Set($.map((U) => U.id)), H = new Map(z.map((U, K) => [U, K]));
      if (g.current = z, x.current = H, d.current = q, t && n === "trace")
        for (const U of $)
          T.has(U.id) || Te.trace({ logLevel: n, tag: null }, `[Sequence registration] Registered "${U.displayName}" (${U.id}) after commit`, U);
      y((U) => Ud({
        current: U,
        entries: $,
        previousDescriptors: M,
        previousKeys: T,
        nextKeys: q,
        getKey: (K) => K.id,
        order: H,
        orderProperty: "timelineOrder"
      }));
    });
  }, [t, n, i, y]), E = l.useCallback((O, N) => {
    c.current || (u.current = !0, b(i, O, N));
  }, [b, i]), k = l.useMemo(() => ({
    onCommitSequences: b,
    commitRegistrationRequested: o
  }), [b, o]);
  Sk(() => {
    if (!o)
      return;
    let O = !1;
    w.current = !1;
    const N = () => {
      h.current || (h.current = !0, f.current.clear(), queueMicrotask(() => {
        if (w.current)
          return;
        const V = d.current;
        d.current = /* @__PURE__ */ new Set(), v.current.clear(), y((B) => B.filter((A) => !V.has(A.id))), a(!1);
      }));
    }, j = (V) => {
      const { detail: B } = V, A = B.sequenceManagers.find((R) => R.managerId === i);
      if (!A || s)
        return;
      const T = g.current;
      if (T === A.sequenceIds || T !== null && T.length === A.sequenceIds.length && T.every((R, $) => R === A.sequenceIds[$]))
        return;
      const M = new Map(A.sequenceIds.map((R, $) => [
        R,
        $
      ]));
      g.current = A.sequenceIds, x.current = M, queueMicrotask(() => {
        O || y((R) => {
          let $ = !1;
          const z = R.map((q) => {
            const H = M.get(q.id) ?? null;
            return q.timelineOrder === H ? q : ($ = !0, { ...q, timelineOrder: H });
          });
          return $ ? z : R;
        });
      });
    };
    return window.addEventListener(Od, j), window.addEventListener($r, N), s && queueMicrotask(() => {
      O || u.current || h.current || (c.current = !0, b(i, [], []), a(!1));
    }), () => {
      O = !0, w.current = !0, window.removeEventListener(Od, j), window.removeEventListener($r, N);
    };
  }, [
    o,
    i,
    y,
    s,
    b
  ]);
  const P = l.useCallback((O) => {
    t && Te.trace({ logLevel: n, tag: null }, `[Sequence registration] Registered "${O.displayName}" (${O.id}) after commit`, O), y((N) => [
      ...N,
      {
        ...O,
        timelineOrder: x.current?.get(O.id) ?? null
      }
    ]);
  }, [t, n, y]), F = l.useCallback((O) => {
    y((N) => {
      const j = N.findIndex((A) => A.id === O.id);
      if (j === -1)
        return N;
      const V = {
        ...O,
        timelineOrder: x.current?.get(O.id) ?? null
      };
      if (Em(N[j], V))
        return N;
      const B = [...N];
      return B[j] = V, B;
    });
  }, [y]), I = l.useCallback((O) => {
    y((N) => N.filter((j) => j.id !== O));
  }, [y]), L = l.useMemo(() => ({
    registerSequence: P,
    updateSequence: F,
    unregisterSequence: I
  }), [P, I, F]), _ = l.useMemo(() => o ? {
    type: "sequence-manager",
    id: i,
    onCommit: s ? E : null
  } : null, [
    s,
    E,
    i,
    o
  ]);
  return /* @__PURE__ */ S.jsx(xk, {
    value: C,
    _remotionCommitMetadata: _,
    children: /* @__PURE__ */ S.jsx(zm.Provider, {
      value: k,
      children: /* @__PURE__ */ S.jsx(mr.Provider, {
        value: L,
        children: /* @__PURE__ */ S.jsx(Ms.Provider, {
          value: p,
          children: /* @__PURE__ */ S.jsx(gl.Provider, {
            value: s,
            children: e
          })
        })
      })
    })
  });
}, Oi = typeof window > "u" ? D.useEffect : D.useLayoutEffect, bk = D.useInsertionEffect ?? Oi, Bm = D.createContext(null), A0 = D.createContext(null), Ek = ({ children: e, dragOverridesSubscription: t, fromKeys: n }) => {
  const { isStudio: r } = ae(), o = l.useContext(ul), i = l.useContext(gl), s = l.useContext(mr), a = l.useMemo(() => ({ ...t, manager: s }), [t, s]), u = l.useMemo(() => ({ manager: s, keys: n }), [n, s]);
  return /* @__PURE__ */ S.jsx(A0.Provider, {
    value: u,
    children: /* @__PURE__ */ S.jsx(Bm.Provider, {
      value: a,
      children: /* @__PURE__ */ S.jsx(Ts.Provider, {
        value: (o?.limit ?? Is) > 0 && r && i && typeof D.Activity < "u",
        children: /* @__PURE__ */ S.jsx(wk, {
          children: /* @__PURE__ */ S.jsx(fk, {
            children: e
          })
        })
      })
    })
  });
}, Kd = {}, kk = /* @__PURE__ */ new Set(), Gd = {}, ut = (e) => `${e.absolutePath}\0${e.nodePath.join(".")}\0${e.sequenceKeys.join(".")}\0${e.effectKeys.map((t) => t.join(".")).join(".")}`, L0 = D.createContext({
  propStatuses: {}
}), Sl = D.createContext({
  current: {}
}), Um = D.createContext({
  subscribe: () => () => {
  },
  getSnapshot: () => null
}), O0 = {
  getDragOverrides: () => {
    throw new Error("VisualModeDragOverridesContext not initialized");
  },
  getEffectDragOverrides: () => {
    throw new Error("VisualModeDragOverridesContext not initialized");
  }
}, j0 = D.createContext(O0), D0 = D.createContext({ current: O0 }), Wm = (e, t) => {
  const n = l.useContext(Gt), [, r] = l.useState(0), o = $n(e, t, t);
  return bk(() => {
    if (n)
      return e(() => r((i) => i + 1));
  }, [n, e]), o;
}, V0 = (e) => {
  const t = l.useContext(Bm), n = l.useContext(mr), r = t?.manager === n ? t : null, o = e === null ? null : ut(e), i = l.useCallback((a) => r?.subscribe(o, a) ?? (() => {
  }), [o, r]), s = l.useCallback(() => r?.getSnapshot(o) ?? Kd, [o, r]);
  return Wm(i, s);
}, z0 = (e) => {
  const t = l.useContext(Um), n = e === null ? null : ut(e), r = l.useCallback((i) => t.subscribe(n, i), [n, t]), o = l.useCallback(() => t.getSnapshot(n), [n, t]);
  return Wm(r, o);
}, Pk = () => {
  const e = l.useContext(A0), t = l.useContext(mr);
  return e?.manager === t ? e.keys : kk;
}, Ik = (e) => {
  const t = l.useContext(Bm), n = l.useContext(mr), r = t?.manager === n ? t : null, o = e === null ? null : ut(e), i = l.useCallback((a) => r?.subscribeEffects(o, a) ?? (() => {
  }), [o, r]), s = l.useCallback(() => r?.getEffectSnapshot(o) ?? Gd, [o, r]);
  return Wm(i, s);
}, B0 = D.createContext({
  setDragOverrides: () => {
    throw new Error("VisualModeSettersContext not initialized");
  },
  clearDragOverrides: () => {
    throw new Error("VisualModeSettersContext not initialized");
  },
  setEffectDragOverrides: () => {
    throw new Error("VisualModeSettersContext not initialized");
  },
  clearEffectDragOverrides: () => {
    throw new Error("VisualModeSettersContext not initialized");
  },
  setPropStatuses: () => {
    throw new Error("VisualModeSettersContext not initialized");
  },
  remapPropStatuses: () => {
    throw new Error("VisualModeSettersContext not initialized");
  }
}), U0 = D.createContext(null), Sc = (e, t) => `${ut(e)}.effects.${t}`, W0 = ({ children: e }) => {
  const [t, n] = l.useState(() => ({
    overrides: {},
    fromKeys: /* @__PURE__ */ new Set()
  })), r = t.overrides, o = l.useRef({
    snapshot: r,
    listeners: /* @__PURE__ */ new Map()
  }), [i, s] = l.useState({}), a = l.useRef({
    snapshot: i,
    byNode: /* @__PURE__ */ new Map(),
    listeners: /* @__PURE__ */ new Map()
  }), [u, c] = l.useState({}), d = l.useRef(u), m = l.useRef(u), f = l.useRef(/* @__PURE__ */ new Map());
  Oi(() => {
    const T = d.current;
    d.current = u;
    for (const [M, R] of f.current)
      if (T[M] !== u[M])
        for (const $ of R)
          $();
  }, [u]);
  const v = l.useCallback((T) => {
    n((M) => {
      const R = M.overrides;
      let $ = null, z = M.fromKeys;
      for (const { nodePath: q, key: H, value: U } of T) {
        const K = ut(q), Q = ($ ?? R)[K]?.[H];
        Q === U || Q?.type === "static" && U.type === "static" && Object.is(Q.value, U.value) || ($ === null && ($ = { ...R }), $[K] === R[K] && ($[K] = { ...R[K] }), $[K][H] = U, H === "from" && !z.has(K) && (z = new Set(z), z.add(K)));
      }
      return $ === null ? M : { overrides: $, fromKeys: z };
    });
  }, []), h = l.useCallback((T, M, R) => v([{ nodePath: T, key: M, value: R }]), [v]), w = l.useCallback((T, M) => {
    if (T === null)
      return () => {
      };
    let R = o.current.listeners.get(T);
    return R || (R = /* @__PURE__ */ new Set(), o.current.listeners.set(T, R)), R.add(M), () => {
      R.delete(M), R.size === 0 && o.current.listeners.delete(T);
    };
  }, []), x = l.useCallback((T) => T === null ? Kd : o.current.snapshot[T] ?? Kd, []);
  Oi(() => {
    const T = o.current.snapshot;
    o.current.snapshot = r;
    for (const M of /* @__PURE__ */ new Set([
      ...Object.keys(T),
      ...Object.keys(r)
    ]))
      if (T[M] !== r[M])
        for (const R of o.current.listeners.get(M) ?? [])
          R();
  }, [r]);
  const g = l.useCallback((T, M) => {
    if (T === null)
      return () => {
      };
    let R = a.current.listeners.get(T);
    return R || (R = /* @__PURE__ */ new Set(), a.current.listeners.set(T, R)), R.add(M), () => {
      R.delete(M), R.size === 0 && a.current.listeners.delete(T);
    };
  }, []), p = l.useCallback((T) => T === null ? Gd : a.current.byNode.get(T) ?? Gd, []);
  Oi(() => {
    const T = a.current.snapshot, M = new Map(a.current.byNode), R = /* @__PURE__ */ new Set();
    for (const $ of /* @__PURE__ */ new Set([
      ...Object.keys(T),
      ...Object.keys(i)
    ])) {
      if (T[$] === i[$])
        continue;
      const z = $.lastIndexOf(".effects.");
      if (z === -1)
        throw new Error("Invalid effect drag override key");
      const q = $.slice(0, z), H = $.slice(z + 9);
      R.has(q) || (M.set(q, { ...M.get(q) }), R.add(q));
      const U = M.get(q);
      i[$] === void 0 ? delete U[H] : U[H] = i[$];
    }
    for (const $ of R)
      Object.keys(M.get($)).length === 0 && M.delete($);
    a.current.snapshot = i, a.current.byNode = M;
    for (const $ of R)
      for (const z of a.current.listeners.get($) ?? [])
        z();
  }, [i]);
  const y = l.useCallback((T) => {
    n((M) => {
      const R = M.overrides, $ = ut(T);
      if (!R[$])
        return M;
      const z = { ...R };
      delete z[$];
      const q = M.fromKeys.has($) ? new Set(M.fromKeys) : M.fromKeys;
      return q.delete($), { overrides: z, fromKeys: q };
    });
  }, []), C = l.useCallback((T) => {
    s((M) => {
      let R = null;
      for (const { nodePath: $, effectIndex: z, key: q, value: H } of T) {
        const U = Sc($, z), K = (R ?? M)[U]?.[q];
        K === H || K?.type === "static" && H.type === "static" && Object.is(K.value, H.value) || (R === null && (R = { ...M }), R[U] === M[U] && (R[U] = { ...M[U] }), R[U][q] = H);
      }
      return R ?? M;
    });
  }, []), b = l.useCallback((T, M, R, $) => C([{ nodePath: T, effectIndex: M, key: R, value: $ }]), [C]), E = l.useCallback((T, M) => {
    s((R) => {
      const $ = Sc(T, M);
      if (!R[$])
        return R;
      const z = { ...R };
      return delete z[$], z;
    });
  }, []), k = l.useCallback((T) => {
    const M = m.current, R = T(M);
    R !== M && (m.current = R, c(R));
  }, []), P = l.useCallback((T, M) => {
    k((R) => {
      const $ = ut(T), z = R[$], q = M(z);
      return z === q ? R : { ...R, [$]: q };
    });
  }, [k]), F = l.useCallback((T) => {
    k((M) => {
      const R = { ...M };
      for (const $ of T)
        delete R[ut($.previousNodePath)];
      for (const $ of T)
        $.nodePath !== null && $.result !== null && (R[ut($.nodePath)] = $.result);
      return R;
    });
  }, [k]), I = l.useMemo(() => ({
    subscribe: w,
    getSnapshot: x,
    subscribeEffects: g,
    getEffectSnapshot: p
  }), [
    x,
    p,
    w,
    g
  ]), L = l.useCallback((T) => r[ut(T)] ?? {}, [r]), _ = l.useCallback((T, M) => i[Sc(T, M)] ?? {}, [i]), O = l.useMemo(() => ({
    propStatuses: u
  }), [u]), N = l.useMemo(() => ({
    subscribe: (T, M) => {
      if (T === null)
        return () => {
        };
      let R = f.current.get(T);
      return R || (R = /* @__PURE__ */ new Set(), f.current.set(T, R)), R.add(M), () => {
        R.delete(M), R.size === 0 && f.current.delete(T);
      };
    },
    getSnapshot: (T) => T === null ? null : m.current[T] ?? null
  }), []), j = l.useMemo(() => ({
    getDragOverrides: L,
    getEffectDragOverrides: _
  }), [L, _]), V = l.useRef(j);
  Oi(() => {
    V.current = j;
  }, [j]);
  const B = l.useMemo(() => ({
    setDragOverrides: h,
    clearDragOverrides: y,
    setEffectDragOverrides: b,
    clearEffectDragOverrides: E,
    setPropStatuses: P,
    remapPropStatuses: F
  }), [
    h,
    y,
    b,
    E,
    P,
    F
  ]), A = l.useMemo(() => ({ setDragOverridesBatch: v, setEffectDragOverridesBatch: C }), [v, C]);
  return /* @__PURE__ */ S.jsx(Ck, {
    children: /* @__PURE__ */ S.jsx(Sl.Provider, {
      value: d,
      children: /* @__PURE__ */ S.jsx(Um.Provider, {
        value: N,
        children: /* @__PURE__ */ S.jsx(L0.Provider, {
          value: O,
          children: /* @__PURE__ */ S.jsx(Ek, {
            dragOverridesSubscription: I,
            fromKeys: t.fromKeys,
            children: /* @__PURE__ */ S.jsx(j0.Provider, {
              value: j,
              children: /* @__PURE__ */ S.jsx(D0.Provider, {
                value: V,
                children: /* @__PURE__ */ S.jsx(B0.Provider, {
                  value: B,
                  children: /* @__PURE__ */ S.jsx(U0.Provider, {
                    value: A,
                    children: e
                  })
                })
              })
            })
          })
        })
      })
    })
  });
}, Ar = l.createContext(null), q0 = l.createContext({
  premountFramesRemaining: 0
}), gn = ({
  from: e,
  durationInFrames: t,
  premountFor: n,
  postmountFor: r,
  style: o,
  styleWhilePremounted: i,
  styleWhilePostmounted: s,
  hideWhilePremounted: a
}) => {
  const u = l.useContext(q0), c = ae(), { fps: d } = bt(), m = l.useContext(Ur), f = n ?? Math.round(m * d), v = r ?? 0, h = !c.isRendering && (f !== 0 || v !== 0), w = ll(h) - u.premountFramesRemaining, x = e + t, g = l.useContext(ge), p = C0({
    absoluteFrame: Mm(h),
    cumulatedFrom: g ? g.cumulatedFrom + g.relativeFrom : 0,
    from: e,
    parentPlaybackRate: g?.playbackRate ?? 1,
    durationInFrames: t
  }), y = !c.isRendering && w - e < -p && w - (e - f) >= -p, C = !c.isRendering && w - x >= -p && w - (x + v) < -p, b = y || C, E = y ? e : C ? e + t - 1 : 0, k = l.useMemo(() => b ? {
    ...o,
    ...a === "opacity" ? { opacity: 0 } : { display: "none" },
    pointerEvents: "none",
    ...y ? i : {},
    ...C ? s : {}
  } : o, [
    b,
    a,
    C,
    y,
    o,
    s,
    i
  ]);
  return {
    effectivePremountFor: f,
    effectivePostmountFor: v,
    premountingActive: y,
    postmountingActive: C,
    isPremountingOrPostmounting: b,
    freezeFrame: E,
    premountingStyle: k
  };
}, cv = typeof window > "u" ? l.useEffect : l.useLayoutEffect, H0 = ({
  getSequence: e,
  id: t
}) => {
  const { registerSequence: n, unregisterSequence: r, updateSequence: o } = l.useContext(mr), i = l.useContext(wl), s = l.useContext(gl), a = l.useRef(e);
  cv(() => {
    a.current = e;
  }, [e]);
  const u = l.useRef(null), c = e !== null && !i && !s, d = l.useMemo(() => s && !i && e !== null ? e() : null, [s, e, i]);
  return l.useEffect(() => {
    if (!c)
      return;
    const m = a.current;
    if (m === null)
      throw new Error("Expected a sequence registration getter");
    return n(m()), u.current = m, () => {
      u.current = null, r(t);
    };
  }, [t, n, c, r]), cv(() => {
    s || i || e === null || u.current === null || u.current === e || (o(e()), u.current = e);
  }, [
    s,
    e,
    i,
    o
  ]), d;
}, Tk = (e, t) => {
  for (const n of t) {
    const r = n.split("."), o = [e];
    let i = e;
    for (let s = 0; s < r.length - 1; s++) {
      const a = r[s], u = i[a];
      if (u == null) {
        i = null;
        break;
      }
      i = u, o.push(i);
    }
    if (i !== null) {
      delete i[r[r.length - 1]];
      for (let s = o.length - 1; s > 0; s--) {
        const a = o[s];
        if (Object.keys(a).length === 0) {
          const u = r[s - 1];
          delete o[s - 1][u];
        } else
          break;
      }
    }
  }
  return e;
}, br = (e, t) => {
  if (typeof e == "number")
    return e;
  if (e.type === "literal")
    return e.value;
  if (e.type === "binary") {
    const r = br(e.left, t), o = br(e.right, t);
    switch (e.operator) {
      case "+":
        return r + o;
      case "-":
        return r - o;
      case "*":
        return r * o;
      case "/":
        return r / o;
      default:
        throw new Error("Unknown source expression operator");
    }
  }
  const n = e.binding.type === "constant" ? e.binding.value : t?.[e.binding.field] ?? NaN;
  return e.type === "video-config-multiplication" ? n * e.multiplier : e.type === "video-config-subtraction" ? n - e.subtrahend : n;
}, dv = /* @__PURE__ */ new WeakMap(), qm = (e, t) => {
  const n = t === null ? "" : `${t.durationInFrames}:${t.fps}:${t.width}:${t.height}`, r = dv.get(e) ?? /* @__PURE__ */ new Map(), o = r.get(n);
  if (o)
    return o;
  const i = Object.fromEntries(Object.entries(e).map(([s, a]) => {
    if (a.status === "computed")
      return [s, a];
    const u = a.keyframeDisplayOffsetAdjustment === null ? null : br(a.keyframeDisplayOffsetAdjustment, t), c = br(a.keyframePlaybackRateAdjustment ?? 1, t);
    if (u !== null && !Number.isFinite(u) || !Number.isFinite(c) || c <= 0)
      return [s, { status: "computed" }];
    const d = {
      keyframeDisplayOffsetAdjustment: u,
      ...a.keyframePlaybackRateAdjustment === void 0 ? {} : { keyframePlaybackRateAdjustment: c }
    };
    if (a.status === "static") {
      const f = a.numericExpression === void 0 ? a.codeValue : br(a.numericExpression, t);
      return [
        s,
        a.numericExpression !== void 0 && !Number.isFinite(f) ? { status: "computed" } : { ...a, ...d, codeValue: f }
      ];
    }
    const m = a.keyframes.map((f) => ({
      ...f,
      frame: br(f.frame, t)
    }));
    return m.some((f, v) => !Number.isFinite(f.frame) || v > 0 && f.frame <= m[v - 1].frame) ? [s, { status: "computed" }] : [s, { ...a, ...d, keyframes: m }];
  }));
  return r.set(n, i), r.size > 8 && r.delete(r.keys().next().value), dv.set(e, r), i;
}, Rk = 4, Fk = 1e-3, Mk = 1e-7, Nk = 10, ji = 11, da = 1 / (ji - 1), $k = typeof Float32Array == "function";
function K0(e, t) {
  return 1 - 3 * t + 3 * e;
}
function G0(e, t) {
  return 3 * t - 6 * e;
}
function Y0(e) {
  return 3 * e;
}
function Pu(e, t, n) {
  return ((K0(t, n) * e + G0(t, n)) * e + Y0(t)) * e;
}
function Q0(e, t, n) {
  return 3 * K0(t, n) * e * e + 2 * G0(t, n) * e + Y0(t);
}
function _k({
  aX: e,
  _aA: t,
  _aB: n,
  mX1: r,
  mX2: o
}) {
  let i, s, a = 0, u = t, c = n;
  do
    s = u + (c - u) / 2, i = Pu(s, r, o) - e, i > 0 ? c = s : u = s;
  while (Math.abs(i) > Mk && ++a < Nk);
  return s;
}
function Ak(e, t, n, r) {
  let o = t;
  for (let i = 0; i < Rk; ++i) {
    const s = Q0(o, n, r);
    if (s === 0)
      return o;
    const a = Pu(o, n, r) - e;
    o -= a / s;
  }
  return o;
}
function J0(e, t, n, r) {
  if (!(e >= 0 && e <= 1 && n >= 0 && n <= 1))
    throw new Error("bezier x values must be in [0, 1] range");
  const o = $k ? new Float32Array(ji) : new Array(ji);
  if (e !== t || n !== r)
    for (let s = 0; s < ji; ++s)
      o[s] = Pu(s * da, e, n);
  function i(s) {
    let a = 0, u = 1;
    const c = ji - 1;
    for (; u !== c && o[u] <= s; ++u)
      a += da;
    --u;
    const d = (s - o[u]) / (o[u + 1] - o[u]), m = a + d * da, f = Q0(m, e, n);
    return f >= Fk ? Ak(s, m, e, n) : f === 0 ? m : _k({
      aX: s,
      _aA: a,
      _aB: a + da,
      mX1: e,
      mX2: n
    });
  }
  return function(s) {
    const a = Math.min(1, Math.max(0, s));
    return e === t && n === r ? a : a === 0 ? 0 : a === 1 ? 1 : Pu(i(a), t, r);
  };
}
var Lk = (e) => Math.round(e * 1e6) / 1e6, Ok = /* @__PURE__ */ new Set(["deg", "rad", "grad", "turn"]), Z0 = /* @__PURE__ */ new Set([
  "%",
  "cap",
  "ch",
  "cm",
  "cqb",
  "cqh",
  "cqi",
  "cqmax",
  "cqmin",
  "cqw",
  "dvh",
  "dvw",
  "em",
  "ex",
  "ic",
  "in",
  "lh",
  "lvh",
  "lvw",
  "mm",
  "pc",
  "pt",
  "px",
  "q",
  "rem",
  "rlh",
  "svh",
  "svw",
  "vb",
  "vh",
  "vi",
  "vmax",
  "vmin",
  "vw"
]), xl = /^([+-]?(?:\d+\.?\d*|\.\d+))([a-zA-Z%]+)?$/, Yd = /* @__PURE__ */ new Set([
  "left",
  "center",
  "right",
  "top",
  "bottom"
]), ko = (e) => e === "left" ? [{ axis: "x", value: { value: 0, unit: "%" } }] : e === "right" ? [{ axis: "x", value: { value: 100, unit: "%" } }] : e === "top" ? [{ axis: "y", value: { value: 0, unit: "%" } }] : e === "bottom" ? [{ axis: "y", value: { value: 100, unit: "%" } }] : [
  { axis: "x", value: { value: 50, unit: "%" } },
  { axis: "y", value: { value: 50, unit: "%" } }
], wi = { value: 50, unit: "%" }, so = (e) => String(Lk(e));
let Hm = class extends TypeError {
};
var Qd = (e, t) => {
  const n = xl.exec(e);
  if (n === null)
    throw new Hm(`Cannot interpolate "${t}" because "${e}" is not a supported scale, translate, or rotate value`);
  const r = n[2] ?? null, o = Number(n[1]);
  if (!Number.isFinite(o))
    throw new TypeError(`Cannot interpolate "${t}" because "${e}" is not finite`);
  if (r === null)
    return { kind: "scale", value: o, unit: null };
  if (Ok.has(r))
    return { kind: "rotate", value: o, unit: r };
  if (Z0.has(r))
    return { kind: "translate", value: o, unit: r };
  throw new TypeError(`Cannot interpolate "${t}" because "${r}" is not a supported translate or rotate unit`);
}, X0 = ({
  component: e,
  value: t,
  allowPercentage: n
}) => {
  const r = xl.exec(e);
  if (r === null)
    throw new TypeError(`Cannot interpolate "${t}" because "${e}" is not a supported transform-origin ${n ? "length-percentage" : "z length"}`);
  const o = r[2] ?? null, i = Number(r[1]);
  if (!Number.isFinite(i))
    throw new TypeError(`Cannot interpolate "${t}" because "${e}" is not finite`);
  if (o === null || !Z0.has(o) || !n && o === "%")
    throw new TypeError(`Cannot interpolate "${t}" because "${e}" is not a supported transform-origin ${n ? "length-percentage" : "z length"}`);
  return { value: i, unit: o };
}, xc = (e, t) => {
  const n = e.toLowerCase();
  return Yd.has(n) ? { type: "keyword", keyword: n } : {
    type: "length-percentage",
    parsed: X0({
      component: e,
      value: t,
      allowPercentage: !0
    })
  };
}, jk = (e, t, n) => {
  const r = [];
  for (const o of ko(e))
    for (const i of ko(t))
      o.axis !== i.axis && r.push(o.axis === "x" ? [o.value, i.value] : [i.value, o.value]);
  if (r.length === 0)
    throw new TypeError(`Cannot interpolate "${n}" because "${e} ${t}" is not a valid transform-origin keyword pair`);
  return r[0];
}, Dk = (e, t) => {
  if (e.length === 1) {
    const a = xc(e[0], t);
    return a.type === "length-percentage" ? [a.parsed, wi] : a.keyword === "top" || a.keyword === "bottom" ? [
      wi,
      ko(a.keyword)[0].value
    ] : [
      ko(a.keyword)[0].value,
      wi
    ];
  }
  const n = xc(e[0], t), r = xc(e[1], t);
  if (n.type === "length-percentage" && r.type === "length-percentage")
    return [n.parsed, r.parsed];
  if (n.type === "keyword" && r.type === "keyword")
    return jk(n.keyword, r.keyword, t);
  const o = n.type === "keyword" ? n : r.type === "keyword" ? r : null, i = n.type === "length-percentage" ? n.parsed : r.type === "length-percentage" ? r.parsed : null;
  if (o === null || i === null)
    throw new Error("Expected a keyword and a length-percentage value");
  const s = n.type === "keyword";
  if (o.keyword === "left" || o.keyword === "right") {
    if (!s)
      throw new TypeError(`Cannot interpolate "${t}" because horizontal transform-origin keywords must come before a length-percentage value`);
    return [ko(o.keyword)[0].value, i];
  }
  return o.keyword === "top" || o.keyword === "bottom" ? [i, ko(o.keyword)[0].value] : s ? [wi, i] : [i, wi];
}, fv = (e, t) => {
  const [n, r] = Dk(t.slice(0, 2), e), o = t[2] === void 0 ? { value: 0, unit: null } : X0({
    component: t[2],
    value: e,
    allowPercentage: !1
  });
  return {
    kind: "translate",
    values: [n.value, r.value, o.value, 0],
    units: [n.unit, r.unit, o.unit, null],
    dimensions: t[2] === void 0 ? 2 : 3,
    axisRotation: !1
  };
}, Vk = (e) => {
  const t = e.trim().split(/\s+/), n = t.length === 2 ? t[0].toLowerCase() : null;
  if (n === "x" || n === "y" || n === "z") {
    const i = Qd(t[1], e);
    return i.kind !== "rotate" ? null : {
      kind: "rotate",
      values: n === "x" ? [1, 0, 0, i.value] : n === "y" ? [0, 1, 0, i.value] : [0, 0, 1, i.value],
      units: [null, null, null, i.unit],
      dimensions: 4,
      axisRotation: !0
    };
  }
  if (t.length !== 4)
    return null;
  const r = t.slice(0, 3).map(Number);
  if (!r.every(Number.isFinite))
    return null;
  const o = Qd(t[3], e);
  return o.kind !== "rotate" ? null : {
    kind: "rotate",
    values: [r[0], r[1], r[2], o.value],
    units: [null, null, null, o.unit],
    dimensions: 4,
    axisRotation: !0
  };
}, e1 = (e, t) => {
  if (typeof e == "number") {
    if (!Number.isFinite(e))
      throw new Error(`outputRange must contain only finite numbers, but got [${e}]`);
    return {
      kind: "scale",
      values: [e, e, 1, 0],
      units: [null, null, null, null],
      dimensions: 1,
      axisRotation: !1
    };
  }
  if (t === "transform-origin") {
    const s = e.trim().split(/\s+/);
    if (s.length < 1 || s.length > 3 || s[0] === "")
      throw new TypeError(`String outputRange values must contain 1 to 3 components, but got "${e}"`);
    return fv(e, s);
  }
  const n = Vk(e);
  if (n !== null) {
    if (t !== void 0 && t !== "rotate")
      throw new TypeError(`Cannot interpolate "${e}" as ${t} because it is a rotate value`);
    return n;
  }
  const r = e.trim().split(/\s+/);
  if (r.length < 1 || r.length > 3 || r[0] === "") {
    const s = t === void 0 && r.some((a) => !xl.test(a) && !Yd.has(a.toLowerCase())) ? Hm : TypeError;
    throw new s(`String outputRange values must contain 1 to 3 components, but got "${e}"`);
  }
  if (r.some((s) => Yd.has(s.toLowerCase()))) {
    if (t !== void 0)
      throw new TypeError(`Cannot interpolate "${e}" as ${t} because it is a transform-origin value`);
    return fv(e, r);
  }
  const o = r.map((s) => Qd(s, e)), [{ kind: i }] = o;
  for (const s of o)
    if (s.kind !== i)
      throw new TypeError(`Cannot interpolate "${e}" because it mixes ${i} and ${s.kind} values`);
  if (t !== void 0 && t !== i)
    throw new TypeError(`Cannot interpolate "${e}" as ${t} because it is a ${i} value`);
  if (i === "scale") {
    const s = o[0].value, a = o[1]?.value ?? s, u = o[2]?.value ?? 1;
    return {
      kind: i,
      values: [s, a, u, 0],
      units: [null, null, null, null],
      dimensions: o.length,
      axisRotation: !1
    };
  }
  return {
    kind: i,
    values: [o[0].value, o[1]?.value ?? 0, o[2]?.value ?? 0, 0],
    units: [
      o[0].unit,
      o[1]?.unit ?? null,
      o[2]?.unit ?? null,
      null
    ],
    dimensions: o.length,
    axisRotation: !1
  };
}, zk = ({
  kind: e,
  values: t,
  units: n,
  dimensions: r,
  axisRotation: o
}) => o ? `${so(t[0])} ${so(t[1])} ${so(t[2])} ${so(t[3])}${n[3]}` : e === "scale" ? t.slice(0, r).map((i) => so(i)).join(" ") : t.slice(0, r).map((i, s) => `${so(i)}${n[s]}`).join(" "), mv = (e) => e === 0 ? 0 : Math.sign(e) * e * e, Bk = (e) => e === 0 ? 0 : Math.sign(e) * Math.sqrt(Math.abs(e));
function Uk(e, t, n, r) {
  const { extrapolateLeft: o, extrapolateRight: i, easing: s, output: a } = r;
  let u = e;
  const [c, d] = t, [m, f] = n;
  if (u < c) {
    if (o === "identity")
      return u;
    if (o === "clamp")
      u = c;
    else if (o === "wrap") {
      const v = d - c;
      u = ((u - c) % v + v) % v + c;
    }
  }
  if (u > d) {
    if (i === "identity")
      return u;
    if (i === "clamp")
      u = d;
    else if (i === "wrap") {
      const v = d - c;
      u = ((u - c) % v + v) % v + c;
    }
  }
  if (m === f)
    return m;
  if (u = (u - c) / (d - c), u = s(u), a === "perceptual-scale") {
    const v = mv(m), h = mv(f);
    u = Bk(u * (h - v) + v);
  } else
    u = u * (f - m) + m;
  return u;
}
function Km(e, t) {
  let n;
  for (n = 1; n < t.length - 1 && !(t[n] >= e); ++n)
    ;
  return n - 1;
}
var Wk = (e) => e, qk = (e) => e ?? "linear", t1 = (e) => e.remotionShouldExtendRight === !0, Jd = ({
  easing: e,
  segmentIndex: t
}) => e === void 0 ? Wk : typeof e == "function" ? e : e[t], pv = ({
  input: e,
  inputRange: t,
  outputRange: n,
  easing: r,
  extrapolateLeft: o,
  extrapolateRight: i,
  output: s
}) => Uk(e, t, n, {
  easing: r,
  extrapolateLeft: o,
  extrapolateRight: e > t[1] && i === "clamp" && t1(r) ? "extend" : i,
  output: s
}), Gm = ({
  input: e,
  inputRange: t,
  options: n
}) => {
  const r = n?.posterize === void 0 ? e : Math.floor(e / n.posterize) * n.posterize, o = t[0], i = t[t.length - 1];
  if (t.length === 1 || !(r < o && n?.extrapolateLeft === "wrap" || r > i && n?.extrapolateRight === "wrap"))
    return r;
  const s = i - o;
  return ((r - o) % s + s) % s + o;
}, Ns = ({
  input: e,
  inputRange: t,
  outputRange: n,
  options: r
}) => {
  const o = qk(r?.output);
  if (t.length === 1)
    return n[0];
  const i = r?.easing;
  let s = "extend";
  r?.extrapolateLeft !== void 0 && (s = r.extrapolateLeft);
  let a = "extend";
  r?.extrapolateRight !== void 0 && (a = r.extrapolateRight);
  const u = Gm({
    input: e,
    inputRange: t,
    options: r ?? null
  }), c = Km(u, t), d = Jd({
    easing: i,
    segmentIndex: c
  });
  let m = pv({
    input: u,
    inputRange: [t[c], t[c + 1]],
    outputRange: [n[c], n[c + 1]],
    easing: d,
    extrapolateLeft: s,
    extrapolateRight: a,
    output: o
  });
  for (let f = 0; f < c; f++) {
    const v = Jd({
      easing: i,
      segmentIndex: f
    });
    if (!t1(v))
      continue;
    const h = t[f + 1];
    if (u <= h)
      continue;
    const w = pv({
      input: u,
      inputRange: [t[f], h],
      outputRange: [n[f], n[f + 1]],
      easing: v,
      extrapolateLeft: s,
      extrapolateRight: "extend",
      output: o
    });
    m += w - n[f + 1];
  }
  return m;
}, Hk = ({
  input: e,
  inputRange: t,
  outputRange: n,
  options: r,
  outputType: o
}) => {
  const i = n.map((h) => e1(h, o)), s = i.some((h) => h.axisRotation), a = Gm({
    input: e,
    inputRange: t,
    options: r ?? null
  }), u = t.length === 1 ? 0 : Km(a, t), c = s ? i.map((h, w) => {
    if (h.kind !== "rotate" || h.axisRotation)
      return h;
    if (h.dimensions !== 1)
      throw new TypeError("Cannot interpolate a multi-angle rotate value with an axis rotation");
    const x = h.values[0] === 0 ? w === 0 ? i.find((p) => p.axisRotation) : w === i.length - 1 ? [...i].reverse().find((p) => p.axisRotation) : w === u ? i[w + 1] : w === u + 1 ? i[w - 1] : void 0 : void 0, g = x?.axisRotation ? x.values : [0, 0, 1];
    return {
      kind: "rotate",
      values: [g[0], g[1], g[2], h.values[0]],
      units: [null, null, null, h.units[0]],
      dimensions: 4,
      axisRotation: !0
    };
  }) : i, d = c[0]?.kind;
  if (d === void 0)
    throw new Error("outputRange must have at least 1 element");
  for (const h of c)
    if (h.kind !== d)
      throw new TypeError(`Cannot interpolate ${d} values with ${h.kind} values`);
  const m = Math.max(...c.map((h) => h.dimensions)), f = [
    null,
    null,
    null,
    null
  ];
  if (d !== "scale") {
    for (let h = 0; h < m; h++)
      if (!(s && h < 3)) {
        for (const w of c) {
          const x = w.units[h];
          if (x !== null) {
            if (f[h] === null) {
              f[h] = x;
              continue;
            }
            if (f[h] !== x)
              throw new TypeError(`Cannot interpolate ${d} values with different units on axis ${h + 1}: ${f[h]} and ${x}`);
          }
        }
        if (f[h] === null)
          throw new TypeError(`Cannot interpolate ${d} values because axis ${h + 1} has no unit`);
      }
  }
  const v = [0, 0, 0, 0];
  for (let h = 0; h < m; h++)
    v[h] = Ns({
      input: e,
      inputRange: t,
      outputRange: c.map((w) => w.values[h]),
      options: r
    });
  return zk({
    kind: d,
    values: v,
    units: f,
    dimensions: m,
    axisRotation: s
  });
}, Kk = ({
  input: e,
  inputRange: t,
  outputRange: n,
  options: r
}) => {
  const o = n.map((i) => {
    if (typeof i == "string") {
      const u = i.toLowerCase();
      if (u === "normal")
        return 400;
      if (u === "bold")
        return 700;
    }
    const s = typeof i == "string" ? xl.exec(i) : null, a = typeof i == "number" ? i : s !== null && s[2] === void 0 ? Number(s[1]) : Number.NaN;
    if (!Number.isFinite(a) || a < 1 || a > 1e3)
      throw new TypeError(`Cannot interpolate font weight "${i}". Expected "normal", "bold", or a number between 1 and 1000`);
    return a;
  });
  return Ns({
    input: e,
    inputRange: t,
    outputRange: o,
    options: r
  });
}, hv = ({
  input: e,
  inputRange: t,
  outputRange: n,
  options: r
}) => {
  if (t.length === 1)
    return n[0];
  for (let u = 0; u < t.length - 1; u++)
    if (Jd({
      easing: r?.easing,
      segmentIndex: u
    }) !== Ha.step1)
      throw new TypeError(typeof n[0] == "boolean" ? "Booleans can only be interpolated using Easing.step1" : "Non-numeric strings can only be interpolated using Easing.step1");
  const o = Gm({
    input: e,
    inputRange: t,
    options: r ?? null
  }), i = t[0], s = t[t.length - 1];
  if (o < i) {
    if (r?.extrapolateLeft === "identity")
      throw new TypeError(typeof n[0] == "boolean" ? 'extrapolateLeft: "identity" is not supported for booleans' : 'extrapolateLeft: "identity" is not supported for non-numeric strings');
    return n[0];
  }
  if (o > s) {
    if (r?.extrapolateRight === "identity")
      throw new TypeError(typeof n[0] == "boolean" ? 'extrapolateRight: "identity" is not supported for booleans' : 'extrapolateRight: "identity" is not supported for non-numeric strings');
    return n[n.length - 1];
  }
  const a = Km(o, t);
  return o >= t[a + 1] ? n[a + 1] : n[a];
}, Gk = (e) => {
  const t = e[0]?.length;
  if (t === void 0)
    throw new Error("outputRange must have at least 1 element");
  if (t === 0)
    throw new TypeError("outputRange tuples must contain at least 1 number");
  for (const n of e) {
    if (n.length !== t)
      throw new TypeError(`outputRange tuples must all have the same length, but got ${t} and ${n.length}`);
    for (const r of n)
      if (typeof r != "number" || !Number.isFinite(r))
        throw new TypeError(`outputRange tuples must contain only finite numbers, but got [${n.join(",")}]`);
  }
  return t;
}, Yk = ({
  input: e,
  inputRange: t,
  outputRange: n,
  options: r
}) => {
  const o = Gk(n);
  return new Array(o).fill(!0).map((i, s) => Ns({
    input: e,
    inputRange: t,
    outputRange: n.map((a) => a[s]),
    options: r
  }));
};
function Qk(e) {
  for (let t = 1; t < e.length; ++t)
    if (!(e[t] > e[t - 1]))
      throw new Error(`inputRange must be strictly monotonically increasing but got [${e.join(",")}]`);
}
function vv(e, t) {
  if (t.length < 1)
    throw new Error(e + " must have at least 1 element");
  for (const n of t) {
    if (typeof n != "number")
      throw new Error(`${e} must contain only numbers`);
    if (!Number.isFinite(n))
      throw new Error(`${e} must contain only finite numbers, but got [${t.join(",")}]`);
  }
}
function Jk(e, t) {
  if (e === void 0 || typeof e == "function")
    return;
  const n = t - 1;
  if (e.length !== n)
    throw new Error(`When easing is an array, it must have one entry per segment between keyframes (length inputRange.length - 1 = ${n}), but got length ${e.length}`);
  for (let r = 0; r < e.length; r++)
    if (typeof e[r] != "function")
      throw new Error(`easing[${r}] must be a function`);
}
function Zk(e) {
  if (e !== void 0 && (typeof e != "number" || !Number.isFinite(e) || e <= 0))
    throw new Error(`posterize must be a positive finite number, but got ${e}`);
}
function Xk(e) {
  if (!(e === void 0 || e === "linear" || e === "perceptual-scale"))
    throw new Error(`output must be "linear" or "perceptual-scale", but got ${String(e)}`);
}
function e2(e) {
  if (!(e === void 0 || e === "font-weight" || e === "scale" || e === "translate" || e === "rotate" || e === "transform-origin"))
    throw new Error(`outputType must be "font-weight", "scale", "translate", "rotate", or "transform-origin", but got ${String(e)}`);
}
function Kr(e, t, n, r) {
  if (typeof e > "u")
    throw new Error("input can not be undefined");
  if (typeof t > "u")
    throw new Error("inputRange can not be undefined");
  if (typeof n > "u")
    throw new Error("outputRange can not be undefined");
  if (t.length !== n.length)
    throw new Error("inputRange (" + t.length + ") and outputRange (" + n.length + ") must have the same length");
  if (vv("inputRange", t), Qk(t), Jk(r?.easing, t.length), Zk(r?.posterize), Xk(r?.output), e2(r?.outputType), typeof e != "number")
    throw new TypeError("Cannot interpolate an input which is not a number");
  if (!Array.isArray(n))
    throw new Error("outputRange must contain only numbers");
  const o = r?.outputType;
  if (n.some((s) => typeof s == "boolean")) {
    if (!n.every((s) => typeof s == "boolean"))
      throw new TypeError("Boolean outputRange must contain only booleans");
    if (o !== void 0)
      throw new TypeError("Boolean outputRange cannot use outputType");
    return hv({
      input: e,
      inputRange: t,
      outputRange: n,
      options: r
    });
  }
  if (o === "font-weight") {
    if (!n.every((s) => typeof s == "number" || typeof s == "string"))
      throw new TypeError("Font weight outputRange must contain only numbers or strings");
    return Kk({
      input: e,
      inputRange: t,
      outputRange: n,
      options: r
    });
  }
  const i = n.some((s) => typeof s == "string");
  if (o !== void 0 && o !== "scale" && !i)
    throw new TypeError(`${o} outputRange must contain strings with the appropriate CSS units`);
  if (i) {
    if (!n.every((s) => typeof s == "string" || typeof s == "number"))
      throw new TypeError("outputRange must contain only numbers, or supported scale, translate, and rotate strings");
    try {
      return Hk({
        input: e,
        inputRange: t,
        outputRange: n,
        options: r,
        outputType: o
      });
    } catch (s) {
      if (!n.every((u) => typeof u == "string") || !n.some((u) => {
        try {
          return e1(u, o), !1;
        } catch (c) {
          return c instanceof Hm;
        }
      }))
        throw s;
      return hv({
        input: e,
        inputRange: t,
        outputRange: n,
        options: r
      });
    }
  }
  if (n.every((s) => Array.isArray(s)))
    return Yk({ input: e, inputRange: t, outputRange: n, options: r });
  if (!n.every((s) => typeof s == "number"))
    throw new TypeError("outputRange must contain only numbers, numeric tuples, or supported scale, translate, and rotate strings");
  return vv("outputRange", n), Ns({ input: e, inputRange: t, outputRange: n, options: r });
}
var t2 = ({
  inputRange: e,
  outputRange: t,
  options: n
}) => (Kr(e[0], e, t, n), (r) => Ns({ input: r, inputRange: e, outputRange: t, options: n })), n2 = ({
  allowFloats: e,
  durationInFrames: t,
  frame: n
}) => {
  if (typeof n > "u")
    throw new TypeError('Argument missing for parameter "frame"');
  if (typeof n != "number")
    throw new TypeError(`Argument passed for "frame" is not a number: ${n}`);
  if (!Number.isFinite(n))
    throw new RangeError(`Frame ${n} is not finite`);
  if (n < 0 && n < -t)
    throw new RangeError(`Cannot use frame ${n}: Duration of composition is ${t}, therefore the lowest frame that can be rendered is ${-t}`);
  if (n > t - 1)
    throw new RangeError(`Cannot use frame ${n}: Duration of composition is ${t}, therefore the highest frame that can be rendered is ${t - 1}`);
}, r2 = (e) => {
  if (!(typeof e > "u")) {
    if (typeof e != "number")
      throw new TypeError(`A "duration" of a spring must be a "number" but is "${typeof e}"`);
    if (Number.isNaN(e))
      throw new TypeError('A "duration" of a spring is NaN, which it must not be');
    if (!Number.isFinite(e))
      throw new TypeError('A "duration" of a spring must be finite, but is ' + e);
    if (e <= 0)
      throw new TypeError('A "duration" of a spring must be positive, but is ' + e);
  }
}, fa = {
  damping: 10,
  mass: 1,
  stiffness: 100,
  overshootClamping: !1
}, Cc = {};
function gv({
  animation: e,
  now: t,
  config: n
}) {
  const { toValue: r, lastTimestamp: o, current: i, velocity: s } = e, a = Math.min(t - o, 64);
  if (n.damping <= 0)
    throw new Error("Spring damping must be greater than 0, otherwise the spring() animation will never end, causing an infinite loop.");
  const u = n.damping, c = n.mass, d = n.stiffness, m = [
    r,
    o,
    i,
    s,
    u,
    c,
    d,
    t
  ].join("-");
  if (Cc[m])
    return Cc[m];
  const f = -s, v = r - i, h = u / (2 * Math.sqrt(d * c)), w = Math.sqrt(d / c), x = w * Math.sqrt(1 - h ** 2), g = a / 1e3, p = Math.sin(x * g), y = Math.cos(x * g), C = Math.exp(-h * w * g), b = C * (p * ((f + h * w * v) / x) + v * y), E = r - b, k = h * w * b - C * (y * (f + h * w * v) - x * v * p), P = Math.exp(-w * g), F = r - P * (v + (f + w * v) * g), I = P * (f * (g * w - 1) + g * v * w * w), L = {
    toValue: r,
    prevPosition: i,
    lastTimestamp: t,
    current: h < 1 ? E : F,
    velocity: h < 1 ? k : I
  };
  return Cc[m] = L, L;
}
var ma = {};
function n1({
  frame: e,
  fps: t,
  config: n = {}
}) {
  const i = {
    damping: n.damping ?? fa.damping,
    mass: n.mass ?? fa.mass,
    stiffness: n.stiffness ?? fa.stiffness,
    overshootClamping: n.overshootClamping ?? fa.overshootClamping
  }, s = [
    t,
    i.damping,
    i.mass,
    i.overshootClamping,
    i.stiffness
  ].join("-"), a = `${e}-${s}`;
  if (ma[a])
    return ma[a];
  const u = Math.max(0, e), c = Math.ceil(u) - 1, d = c >= 0 ? ma[`${c}-${s}`] : void 0;
  let m = d ?? {
    lastTimestamp: 0,
    current: 0,
    toValue: 1,
    velocity: 0,
    prevPosition: 0
  };
  const f = u % 1, v = d ? c + 1 : 0;
  for (let h = v; h <= Math.floor(u); h++) {
    const w = h / t * 1e3;
    m = gv({
      animation: m,
      now: w,
      config: i
    });
  }
  return f > 0 && (m = gv({
    animation: m,
    now: u / t * 1e3,
    config: i
  })), ma[a] = m, m;
}
var bc = /* @__PURE__ */ new Map();
function r1({
  fps: e,
  config: t = {},
  threshold: n = 5e-3
}) {
  if (typeof n != "number")
    throw new TypeError(`threshold must be a number, got ${n} of type ${typeof n}`);
  if (n === 0)
    return 1 / 0;
  if (n === 1)
    return 0;
  if (isNaN(n))
    throw new TypeError("Threshold is NaN");
  if (!Number.isFinite(n))
    throw new TypeError("Threshold is not finite");
  if (n < 0)
    throw new TypeError("Threshold is below 0");
  const r = [
    e,
    t.damping,
    t.mass,
    t.overshootClamping,
    t.stiffness,
    n
  ].join("-");
  if (bc.has(r))
    return bc.get(r);
  el(e, "to the measureSpring() function");
  let o = 0, i = 0;
  const s = () => n1({
    fps: e,
    frame: o,
    config: t
  });
  let a = s();
  const u = () => Math.abs(a.current - a.toValue);
  let c = u();
  for (; c >= n; )
    o++, a = s(), c = u();
  i = o;
  for (let d = 0; d < 20; d++)
    o++, a = s(), c = u(), c >= n && (d = 0, i = o + 1);
  return bc.set(r, i), i;
}
function yv({
  frame: e,
  fps: t,
  config: n = {},
  from: r = 0,
  to: o = 1,
  durationInFrames: i,
  durationRestThreshold: s,
  delay: a = 0,
  reverse: u = !1
}) {
  r2(i), n2({
    frame: e,
    durationInFrames: 1 / 0,
    allowFloats: !0
  }), el(t, "to spring()");
  const c = u || typeof i < "u", d = c ? r1({
    fps: t,
    config: n,
    threshold: s
  }) : void 0, m = c ? {
    get: () => d
  } : {
    get: () => {
      throw new Error("did not calculate natural duration, this is an error with Remotion. Please report");
    }
  }, v = (u ? (i ?? m.get()) - e : e) + (u ? a : -a), h = i === void 0 ? v : v / (i / m.get());
  if (i && v > i)
    return o;
  const w = n1({
    fps: t,
    frame: h,
    config: n
  }), x = n.overshootClamping ? Math.min(w.current, 1) : w.current;
  return r === 0 && o === 1 ? x : Kr(x, [0, 1], [r, o]);
}
var wv = (e) => Math.min(1, Math.max(0, e)), Si = 30, Sv = null;
let Ha = class o1 {
  static step0(t) {
    return t > 0 ? 1 : 0;
  }
  static step1(t) {
    return t >= 1 ? 1 : 0;
  }
  static linear(t) {
    return t;
  }
  static ease(t) {
    return Sv ?? (Sv = o1.bezier(0.42, 0, 1, 1)), Sv(t);
  }
  static quad(t) {
    return t * t;
  }
  static cubic(t) {
    return t * t * t;
  }
  static poly(t) {
    return (n) => n ** t;
  }
  static sin(t) {
    return 1 - Math.cos(t * Math.PI / 2);
  }
  static circle(t) {
    const n = wv(t);
    return 1 - Math.sqrt(1 - n * n);
  }
  static exp(t) {
    return 2 ** (10 * (t - 1));
  }
  static elastic(t = 1) {
    const n = t * Math.PI;
    return (r) => 1 - Math.cos(r * Math.PI / 2) ** 3 * Math.cos(r * n);
  }
  static back(t = 1.70158) {
    return (n) => n * n * ((t + 1) * n - t);
  }
  static spring({
    allowTail: t = !1,
    durationRestThreshold: n,
    ...r
  } = {}) {
    return Object.assign((i) => i <= 0 ? 0 : !t && i >= 1 ? 1 : yv(t ? {
      fps: Si,
      frame: i * r1({
        fps: Si,
        config: r,
        threshold: n
      }),
      config: r
    } : {
      fps: Si,
      frame: i * Si,
      config: r,
      durationInFrames: Si,
      durationRestThreshold: n
    }), {
      remotionShouldExtendRight: t
    });
  }
  static bounce(t) {
    const n = wv(t);
    if (n < 1 / 2.75)
      return 7.5625 * n * n;
    if (n < 2 / 2.75) {
      const o = n - 0.5454545454545454;
      return 7.5625 * o * o + 0.75;
    }
    if (n < 2.5 / 2.75) {
      const o = n - 0.8181818181818182;
      return 7.5625 * o * o + 0.9375;
    }
    const r = n - 2.625 / 2.75;
    return 7.5625 * r * r + 0.984375;
  }
  static bezier(t, n, r, o) {
    return J0(t, n, r, o);
  }
  static in(t) {
    return t;
  }
  static out(t) {
    return (n) => 1 - t(1 - n);
  }
  static inOut(t) {
    return (n) => n < 0.5 ? t(n * 2) / 2 : 1 - t((1 - n) * 2) / 2;
  }
};
var Vt = "[-+]?\\d*\\.?\\d+", pa = Vt + "%";
function ha(...e) {
  return "\\(\\s*(" + e.join(")\\s*,\\s*(") + ")\\s*\\)";
}
var va = "(?:none|[-+]?\\d*\\.?\\d+(?:%|deg|rad|grad|turn)?)";
function xi(e) {
  return new RegExp(e + "\\(\\s*(" + va + ")\\s+(" + va + ")\\s+(" + va + ")(?:\\s*\\/\\s*(" + va + "))?\\s*\\)");
}
var Je = {
  rgb: void 0,
  rgba: void 0,
  hsl: void 0,
  hsla: void 0,
  hex3: void 0,
  hex4: void 0,
  hex5: void 0,
  hex6: void 0,
  hex8: void 0,
  oklch: void 0,
  oklab: void 0,
  lab: void 0,
  lch: void 0,
  hwb: void 0
};
function o2() {
  return Je.rgb === void 0 && (Je.rgb = new RegExp("rgb" + ha(Vt, Vt, Vt)), Je.rgba = new RegExp("rgba" + ha(Vt, Vt, Vt, Vt)), Je.hsl = new RegExp("hsl" + ha(Vt, pa, pa)), Je.hsla = new RegExp("hsla" + ha(Vt, pa, pa, Vt)), Je.hex3 = /^#([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})$/, Je.hex4 = /^#([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})$/, Je.hex6 = /^#([0-9a-fA-F]{6})$/, Je.hex8 = /^#([0-9a-fA-F]{8})$/, Je.oklch = xi("oklch"), Je.oklab = xi("oklab"), Je.lab = xi("lab"), Je.lch = xi("lch"), Je.hwb = xi("hwb")), Je;
}
function Ao(e, t, n) {
  return n < 0 && (n += 1), n > 1 && (n -= 1), n < 1 / 6 ? e + (t - e) * 6 * n : n < 1 / 2 ? t : n < 2 / 3 ? e + (t - e) * (2 / 3 - n) * 6 : e;
}
function xv(e, t, n) {
  const r = n < 0.5 ? n * (1 + t) : n + t - n * t, o = 2 * n - r, i = Ao(o, r, e + 1 / 3), s = Ao(o, r, e), a = Ao(o, r, e - 1 / 3);
  return Math.round(i * 255) << 24 | Math.round(s * 255) << 16 | Math.round(a * 255) << 8;
}
function ao(e) {
  const t = Number.parseInt(e, 10);
  return t < 0 ? 0 : t > 255 ? 255 : t;
}
function Cv(e) {
  return (Number.parseFloat(e) % 360 + 360) % 360 / 360;
}
function bv(e) {
  const t = Number.parseFloat(e);
  return t < 0 ? 0 : t > 1 ? 255 : Math.round(t * 255);
}
function ga(e) {
  const t = Number.parseFloat(e);
  return t < 0 ? 0 : t > 100 ? 1 : t / 100;
}
function kt(e, t) {
  return e === "none" ? 0 : e.endsWith("%") ? Number.parseFloat(e) / 100 * t : Number.parseFloat(e);
}
function Ec(e) {
  if (e === "none")
    return 0;
  let t = Number.parseFloat(e);
  e.endsWith("grad") ? t *= 0.9 : e.endsWith("rad") ? t = t * 180 / Math.PI : e.endsWith("turn") && (t *= 360);
  const n = t % 360;
  return n < 0 ? (n + 360) % 360 : n;
}
function Ci(e) {
  return e === void 0 || e === "none" ? 1 : e.endsWith("%") ? Math.max(0, Math.min(1, Number.parseFloat(e) / 100)) : Math.max(0, Math.min(1, Number.parseFloat(e)));
}
function Lo(e) {
  return e <= 31308e-7 ? 12.92 * e : 1.055 * e ** (1 / 2.4) - 0.055;
}
function ya(e) {
  return Math.max(0, Math.min(1, e));
}
function bi(e, t, n, r) {
  const o = Math.round(ya(e) * 255), i = Math.round(ya(t) * 255), s = Math.round(ya(n) * 255), a = Math.round(ya(r) * 255);
  return (o << 24 | i << 16 | s << 8 | a) >>> 0;
}
function Ev(e, t, n) {
  const r = e + 0.3963377774 * t + 0.2158037573 * n, o = e - 0.1055613458 * t - 0.0638541728 * n, i = e - 0.0894841775 * t - 1.291485548 * n, s = r * r * r, a = o * o * o, u = i * i * i, c = 4.0767416621 * s - 3.3077115913 * a + 0.2309699292 * u, d = -1.2684380046 * s + 2.6097574011 * a - 0.3413193965 * u, m = -0.0041960863 * s - 0.7034186147 * a + 1.707614701 * u;
  return [Lo(c), Lo(d), Lo(m)];
}
function kv(e, t, n) {
  const r = 0.008856451679035631, o = 24389 / 27, i = 0.95047, s = 1, a = 1.08883, u = (e + 16) / 116, c = t / 500 + u, d = u - n / 200, m = c * c * c, f = d * d * d, v = m > r ? m : (116 * c - 16) / o, h = e > o * r ? ((e + 16) / 116) ** 3 : e / o, w = f > r ? f : (116 * d - 16) / o, x = v * i, g = h * s, p = w * a, y = 3.2404542 * x - 1.5371385 * g - 0.4985314 * p, C = -0.969266 * x + 1.8760108 * g + 0.041556 * p, b = 0.0556434 * x - 0.2040259 * g + 1.0572252 * p;
  return [Lo(y), Lo(C), Lo(b)];
}
function i2(e, t, n) {
  if (t + n >= 1) {
    const c = t / (t + n);
    return [c, c, c];
  }
  const r = 1, o = 0, i = Ao(o, r, e + 1 / 3), s = Ao(o, r, e), a = Ao(o, r, e - 1 / 3), u = 1 - t - n;
  return [i * u + t, s * u + t, a * u + t];
}
var Pv = {
  transparent: 0,
  aliceblue: 4042850303,
  antiquewhite: 4209760255,
  aqua: 16777215,
  aquamarine: 2147472639,
  azure: 4043309055,
  beige: 4126530815,
  bisque: 4293182719,
  black: 255,
  blanchedalmond: 4293643775,
  blue: 65535,
  blueviolet: 2318131967,
  brown: 2771004159,
  burlywood: 3736635391,
  burntsienna: 3934150143,
  cadetblue: 1604231423,
  chartreuse: 2147418367,
  chocolate: 3530104575,
  coral: 4286533887,
  cornflowerblue: 1687547391,
  cornsilk: 4294499583,
  crimson: 3692313855,
  cyan: 16777215,
  darkblue: 35839,
  darkcyan: 9145343,
  darkgoldenrod: 3095792639,
  darkgray: 2846468607,
  darkgreen: 6553855,
  darkgrey: 2846468607,
  darkkhaki: 3182914559,
  darkmagenta: 2332068863,
  darkolivegreen: 1433087999,
  darkorange: 4287365375,
  darkorchid: 2570243327,
  darkred: 2332033279,
  darksalmon: 3918953215,
  darkseagreen: 2411499519,
  darkslateblue: 1211993087,
  darkslategray: 793726975,
  darkslategrey: 793726975,
  darkturquoise: 13554175,
  darkviolet: 2483082239,
  deeppink: 4279538687,
  deepskyblue: 12582911,
  dimgray: 1768516095,
  dimgrey: 1768516095,
  dodgerblue: 512819199,
  firebrick: 2988581631,
  floralwhite: 4294635775,
  forestgreen: 579543807,
  fuchsia: 4278255615,
  gainsboro: 3705462015,
  ghostwhite: 4177068031,
  gold: 4292280575,
  goldenrod: 3668254975,
  gray: 2155905279,
  green: 8388863,
  greenyellow: 2919182335,
  grey: 2155905279,
  honeydew: 4043305215,
  hotpink: 4285117695,
  indianred: 3445382399,
  indigo: 1258324735,
  ivory: 4294963455,
  khaki: 4041641215,
  lavender: 3873897215,
  lavenderblush: 4293981695,
  lawngreen: 2096890111,
  lemonchiffon: 4294626815,
  lightblue: 2916673279,
  lightcoral: 4034953471,
  lightcyan: 3774873599,
  lightgoldenrodyellow: 4210742015,
  lightgray: 3553874943,
  lightgreen: 2431553791,
  lightgrey: 3553874943,
  lightpink: 4290167295,
  lightsalmon: 4288707327,
  lightseagreen: 548580095,
  lightskyblue: 2278488831,
  lightslategray: 2005441023,
  lightslategrey: 2005441023,
  lightsteelblue: 2965692159,
  lightyellow: 4294959359,
  lime: 16711935,
  limegreen: 852308735,
  linen: 4210091775,
  magenta: 4278255615,
  maroon: 2147483903,
  mediumaquamarine: 1724754687,
  mediumblue: 52735,
  mediumorchid: 3126187007,
  mediumpurple: 2473647103,
  mediumseagreen: 1018393087,
  mediumslateblue: 2070474495,
  mediumspringgreen: 16423679,
  mediumturquoise: 1221709055,
  mediumvioletred: 3340076543,
  midnightblue: 421097727,
  mintcream: 4127193855,
  mistyrose: 4293190143,
  moccasin: 4293178879,
  navajowhite: 4292783615,
  navy: 33023,
  oldlace: 4260751103,
  olive: 2155872511,
  olivedrab: 1804477439,
  orange: 4289003775,
  orangered: 4282712319,
  orchid: 3664828159,
  palegoldenrod: 4008225535,
  palegreen: 2566625535,
  paleturquoise: 2951671551,
  palevioletred: 3681588223,
  papayawhip: 4293907967,
  peachpuff: 4292524543,
  peru: 3448061951,
  pink: 4290825215,
  plum: 3718307327,
  powderblue: 2967529215,
  purple: 2147516671,
  rebeccapurple: 1714657791,
  red: 4278190335,
  rosybrown: 3163525119,
  royalblue: 1097458175,
  saddlebrown: 2336560127,
  salmon: 4202722047,
  sandybrown: 4104413439,
  seagreen: 780883967,
  seashell: 4294307583,
  sienna: 2689740287,
  silver: 3233857791,
  skyblue: 2278484991,
  slateblue: 1784335871,
  slategray: 1887473919,
  slategrey: 1887473919,
  snow: 4294638335,
  springgreen: 16744447,
  steelblue: 1182971135,
  tan: 3535047935,
  teal: 8421631,
  thistle: 3636451583,
  tomato: 4284696575,
  turquoise: 1088475391,
  violet: 4001558271,
  wheat: 4125012991,
  white: 4294967295,
  whitesmoke: 4126537215,
  yellow: 4294902015,
  yellowgreen: 2597139199
};
function s2(e) {
  const t = o2();
  let n;
  if (t.hex6 && (n = t.hex6.exec(e)))
    return Number.parseInt(n[1] + "ff", 16) >>> 0;
  if (Pv[e] !== void 0)
    return Pv[e];
  if (t.rgb && (n = t.rgb.exec(e)))
    return (ao(n[1]) << 24 | ao(n[2]) << 16 | ao(n[3]) << 8 | 255) >>> 0;
  if (t.rgba && (n = t.rgba.exec(e)))
    return (ao(n[1]) << 24 | ao(n[2]) << 16 | ao(n[3]) << 8 | bv(n[4])) >>> 0;
  if (t.hex3 && (n = t.hex3.exec(e)))
    return Number.parseInt(n[1] + n[1] + n[2] + n[2] + n[3] + n[3] + "ff", 16) >>> 0;
  if (t.hex8 && (n = t.hex8.exec(e)))
    return Number.parseInt(n[1], 16) >>> 0;
  if (t.hex4 && (n = t.hex4.exec(e)))
    return Number.parseInt(n[1] + n[1] + n[2] + n[2] + n[3] + n[3] + n[4] + n[4], 16) >>> 0;
  if (t.hsl && (n = t.hsl.exec(e)))
    return (xv(Cv(n[1]), ga(n[2]), ga(n[3])) | 255) >>> 0;
  if (t.hsla && (n = t.hsla.exec(e)))
    return (xv(Cv(n[1]), ga(n[2]), ga(n[3])) | bv(n[4])) >>> 0;
  if (t.oklch && (n = t.oklch.exec(e))) {
    const r = kt(n[1], 1), o = kt(n[2], 0.4), i = Ec(n[3]), s = Ci(n[4]), a = i * Math.PI / 180, [u, c, d] = Ev(r, o * Math.cos(a), o * Math.sin(a));
    return bi(u, c, d, s);
  }
  if (t.oklab && (n = t.oklab.exec(e))) {
    const r = kt(n[1], 1), o = kt(n[2], 0.4), i = kt(n[3], 0.4), s = Ci(n[4]), [a, u, c] = Ev(r, o, i);
    return bi(a, u, c, s);
  }
  if (t.lab && (n = t.lab.exec(e))) {
    const r = kt(n[1], 100), o = kt(n[2], 125), i = kt(n[3], 125), s = Ci(n[4]), [a, u, c] = kv(r, o, i);
    return bi(a, u, c, s);
  }
  if (t.lch && (n = t.lch.exec(e))) {
    const r = kt(n[1], 100), o = kt(n[2], 150), i = Ec(n[3]), s = Ci(n[4]), a = i * Math.PI / 180, [u, c, d] = kv(r, o * Math.cos(a), o * Math.sin(a));
    return bi(u, c, d, s);
  }
  if (t.hwb && (n = t.hwb.exec(e))) {
    const r = Ec(n[1]), o = kt(n[2], 1), i = kt(n[3], 1), s = Ci(n[4]), [a, u, c] = i2(r / 360, o, i);
    return bi(a, u, c, s);
  }
  throw new Error(`invalid color string ${e} provided`);
}
var Iv = (e) => (e >> 24 & 255) / 255, a2 = (e) => e >> 16 & 255, u2 = (e) => e >> 8 & 255, l2 = (e) => e & 255, c2 = (e, t, n, r) => `rgba(${e}, ${t}, ${n}, ${r})`;
function d2(e) {
  const t = s2(e);
  return (t << 24 | t >>> 8) >>> 0;
}
var f2 = (e, t, n, r) => {
  const [o, i, s, a] = [a2, u2, l2, Iv].map((u) => {
    const c = Kr(e, t, n.map((d) => u(d)), {
      easing: r?.easing,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      posterize: r?.posterize
    });
    return u === Iv ? Number(c.toFixed(3)) : Math.round(c);
  });
  return c2(o, i, s, a);
}, m2 = (e, t, n, r) => {
  if (typeof e > "u")
    throw new TypeError("input can not be undefined");
  if (typeof t > "u")
    throw new TypeError("inputRange can not be undefined");
  if (typeof n > "u")
    throw new TypeError("outputRange can not be undefined");
  if (t.length !== n.length)
    throw new TypeError("inputRange (" + t.length + " values provided) and outputRange (" + n.length + " values provided) must have the same length");
  const o = n.map((i) => d2(i));
  return f2(e, t, o, r);
}, Zd = null, p2 = (e) => {
  Zd = e;
}, Ka = ({
  easing: e,
  forceSpringAllowTail: t
}) => {
  switch (e.type) {
    case "linear":
      return Ha.linear;
    case "step1":
      return Ha.step1;
    case "spring":
      return Ha.spring({
        allowTail: t ?? e.allowTail ?? void 0,
        damping: e.damping,
        durationRestThreshold: e.durationRestThreshold ?? void 0,
        mass: e.mass,
        overshootClamping: e.overshootClamping,
        stiffness: e.stiffness
      });
    case "bezier":
      return J0(e.x1, e.y1, e.x2, e.y2);
    default:
      throw new TypeError(`Unsupported easing: ${JSON.stringify(e)}`);
  }
}, h2 = ({
  forceSpringAllowTail: e,
  status: t
}) => {
  if (t.interpolationFunction !== "interpolate" || t.keyframes.length === 0)
    return null;
  const n = [...t.keyframes].sort((i, s) => i.frame - s.frame), r = n.map((i) => i.frame), o = n.map((i) => i.value);
  if (!o.every((i) => typeof i == "number"))
    return null;
  try {
    const i = t2({
      inputRange: r,
      outputRange: o,
      options: {
        easing: t.easing.map((s) => Ka({ easing: s, forceSpringAllowTail: e })),
        extrapolateLeft: t.clamping.left,
        extrapolateRight: t.clamping.right,
        output: t.output,
        posterize: t.posterize
      }
    });
    return (s) => {
      try {
        return i(s);
      } catch {
        return null;
      }
    };
  } catch {
    return null;
  }
}, $s = ({
  frame: e,
  forceSpringAllowTail: t,
  status: n
}) => {
  const { keyframes: r, easing: o, clamping: i, interpolationFunction: s } = n;
  if (r.length === 0)
    return null;
  const a = [...r].sort((d, m) => d.frame - m.frame), u = a.map((d) => d.frame), c = a.map((d) => d.value);
  if (s === "interpolatePaths") {
    if (!c.every((d) => typeof d == "string"))
      return null;
    if (r.length === 1)
      return c[0];
    if (!Zd || i.left === "identity" || i.right === "identity")
      return null;
    try {
      return Zd(e, u, c, {
        easing: o.map((d) => Ka({ easing: d, forceSpringAllowTail: t })),
        extrapolateLeft: i.left,
        extrapolateRight: i.right,
        posterize: n.posterize
      });
    } catch {
      return null;
    }
  }
  if (s === "interpolateColors") {
    if (!c.every((d) => typeof d == "string"))
      return null;
    if (r.length === 1)
      return c[0];
    try {
      return m2(e, u, c, {
        easing: o.map((d) => Ka({ easing: d, forceSpringAllowTail: t })),
        posterize: n.posterize
      });
    } catch {
      return null;
    }
  }
  if (s !== "interpolate")
    return null;
  try {
    return Kr(e, u, c, {
      easing: o.map((d) => Ka({ easing: d, forceSpringAllowTail: t })),
      extrapolateLeft: i.left,
      extrapolateRight: i.right,
      output: n.output,
      posterize: n.posterize
    });
  } catch {
    return null;
  }
}, Cl = ({
  frame: e,
  status: t
}) => e * (t.keyframePlaybackRateAdjustment ?? 1) - (t.keyframeDisplayOffsetAdjustment ?? 0), vs = ({
  dragOverrideValue: e,
  frame: t
}) => {
  if (e === void 0)
    return { type: "none" };
  if (e.type === "static")
    return { type: "resolved", value: e.value };
  if (t === null)
    return { type: "none" };
  const n = $s({
    forceSpringAllowTail: null,
    frame: Cl({
      frame: t,
      status: e.status
    }),
    status: e.status
  });
  return n === null ? { type: "none" } : { type: "resolved", value: n };
}, i1 = ({
  propStatus: e,
  dragOverrideValue: t,
  defaultValue: n,
  frame: r = null,
  shouldResortToDefaultValueIfUndefined: o = !1
}) => {
  const i = vs({
    dragOverrideValue: t,
    frame: r
  });
  return i.type === "resolved" && i.value !== void 0 ? i.value : e.status === "keyframed" ? r !== null ? $s({
    forceSpringAllowTail: null,
    frame: Cl({ frame: r, status: e }),
    status: e
  }) : o ? n : void 0 : e.codeValue === void 0 && o ? n : e.codeValue;
}, Ym = l.createContext({
  overrideIdToNodePathMappings: {}
}), v2 = l.createContext({
  setOverrideIdToNodePath: () => {
    throw new Error("OverrideIdsToNodePathsSettersContext not initialized");
  }
}), sr = /* @__PURE__ */ new Map(), Ga = /* @__PURE__ */ new Map(), Xd = /* @__PURE__ */ new WeakMap(), Iu = /* @__PURE__ */ new WeakMap(), ef = /* @__PURE__ */ new Map(), g2 = D.useInsertionEffect ?? l.useLayoutEffect, y2 = ({
  sequenceKey: e,
  effectIndex: t,
  onSource: n
}) => {
  let r = sr.get(e);
  r || (r = /* @__PURE__ */ new Map(), sr.set(e, r));
  let o = r.get(t);
  return o || (o = /* @__PURE__ */ new Set(), r.set(t, o)), o.add(n), Ga.get(e)?.forEach((i) => i()), () => {
    o.delete(n), o.size === 0 && r.delete(t), r.size === 0 && sr.delete(e);
  };
}, w2 = (e, t, n) => {
  if (sr.size === 0)
    return;
  const r = Xd.get(e);
  if (!r)
    return;
  const o = sr.get(r.sequenceKey)?.get(r.effectIndex);
  if (!o || o.size === 0)
    return;
  let i = Iu.get(n);
  i || (i = /* @__PURE__ */ new Map(), Iu.set(n, i));
  const s = `${r.sequenceKey}\0${r.effectIndex}`;
  i.set(s, r), ef.set(s, n), o.forEach((a) => {
    try {
      a(t);
    } catch {
    }
  });
}, S2 = (e) => {
  const t = Iu.get(e);
  Iu.delete(e), t?.forEach((n, r) => {
    ef.get(r) === e && (ef.delete(r), sr.get(n.sequenceKey)?.get(n.effectIndex)?.forEach((o) => {
      try {
        o(null);
      } catch {
      }
    }));
  });
}, x2 = (e, t) => {
  const [n, r] = l.useState(0);
  return l.useLayoutEffect(() => {
    if (t === null)
      return;
    let o = Ga.get(t);
    o || (o = /* @__PURE__ */ new Set(), Ga.set(t, o));
    const i = () => r((s) => s + 1);
    return o.add(i), sr.has(t) && i(), () => {
      o.delete(i), o.size === 0 && (Ga.delete(t), sr.get(t)?.forEach((s) => {
        s.forEach((a) => {
          try {
            a(null);
          } catch {
          }
        });
      }));
    };
  }, [t]), g2(() => {
    if (t !== null)
      return e.forEach((o, i) => {
        Xd.set(o, { sequenceKey: t, effectIndex: i });
      }), () => {
        e.forEach((o) => Xd.delete(o));
      };
  }, [e, t]), l.useMemo(() => t === null || n === 0 ? e : e.slice(), [e, n, t]);
}, Tv = {}, s1 = D.useInsertionEffect ?? l.useLayoutEffect, Ya = (e, t) => Object.is(e, t) ? !0 : e === null || t === null || typeof e != "object" || typeof t != "object" || Object.getPrototypeOf(e) !== Object.prototype || Object.getPrototypeOf(t) !== Object.prototype ? !1 : Em(e, t), C2 = ({
  descriptor: e,
  propStatusOverrides: t,
  dragOverrides: n,
  frame: r
}) => {
  if (!t && !n)
    return { params: e.params, effectKey: e.effectKey };
  const o = {
    ...e.params
  };
  if (t)
    for (const [i, s] of Object.entries(t))
      s !== void 0 && (o[i] = s);
  if (n)
    for (const [i, s] of Object.entries(n)) {
      const a = vs({
        dragOverrideValue: s,
        frame: r
      });
      a.type === "resolved" && (o[i] = a.value);
    }
  return {
    params: o,
    effectKey: e.definition.calculateKey(o)
  };
}, b2 = (e, t) => {
  if (!e)
    return null;
  const n = {};
  let r = !1;
  for (const [o, i] of Object.entries(e)) {
    if (i.status === "static") {
      n[o] = i.codeValue, r = !0;
      continue;
    }
    if (i.status === "keyframed") {
      const s = $s({
        forceSpringAllowTail: null,
        frame: Cl({ frame: t, status: i }),
        status: i
      });
      s !== null && (n[o] = s, r = !0);
    }
  }
  return r ? n : null;
}, _s = (e) => {
  const t = l.useContext(Gt), n = l.useRef(null), r = n.current, o = r !== null && r.definitions.length === e.length && r.definitions.every((a, u) => a === e[u].definition), i = o ? r.controllers : e.map((a) => ps(a.params)), s = o ? r.definitions : Object.assign(e.map((a) => a.definition), {
    runtimeValues: i.map((a) => a.store)
  });
  return s1(() => {
    if (n.current = { definitions: s, controllers: i }, !t || i.length === 0 || i.every((u, c) => Ya(u.store.getSnapshot(), e[c]?.params)))
      return;
    let a = !1;
    return queueMicrotask(() => {
      a || i.forEach((u, c) => {
        const d = e[c]?.params, m = u.store.getSnapshot();
        Ya(d, m) || u.setSnapshot(d);
      });
    }), () => {
      a = !0;
    };
  }, [t, i, e, s]), l.useLayoutEffect(() => {
    s.forEach((a, u) => {
      const c = e[u]?.params;
      Ya(i[u].store.getSnapshot(), c) || i[u].setSnapshot(c);
    });
  }, [i, e, s]), s;
}, a1 = ({
  status: e,
  effectIndex: t,
  videoConfigValues: n
}) => {
  if (!e)
    return { type: "cannot-update-sequence", reason: "not-found" };
  if (!e.canUpdate)
    return { type: "cannot-update-sequence", reason: e.reason };
  const r = e.effects.find((o) => o.effectIndex === t);
  return r ? r.canUpdate ? {
    type: "can-update-effect",
    props: qm(r.props, n)
  } : { type: "cannot-update-effect", reason: r.reason } : { type: "cannot-update-effect", reason: "not-found" };
}, E2 = ({
  propStatuses: e,
  nodePath: t,
  effectIndex: n
}) => a1({
  status: e[ut(t)] ?? null,
  effectIndex: n,
  videoConfigValues: t.videoConfigValues
}), u1 = (e, t) => {
  if (e && e.canUpdate)
    return qm(e.props, t);
}, k2 = (e, t) => u1(e[ut(t)] ?? null, t.videoConfigValues), As = ({
  effects: e,
  overrideId: t,
  videoConfigValues: n
}) => {
  const r = l.useRef(null), { isStudio: o } = ae(), { overrideIdToNodePathMappings: i } = l.useContext(Ym), s = r.current, a = t ? i[t] ?? null : null, u = Ik(a), c = z0(a), d = l.useMemo(() => Array.from({ length: e.length }, (x, g) => {
    if (a === null)
      return null;
    const p = a1({
      status: c,
      effectIndex: g,
      videoConfigValues: n
    });
    return p.type === "can-update-effect" ? p.props : null;
  }), [e.length, a, c, n]), m = l.useMemo(() => d.map((x, g) => Object.values(x ?? {}).some((p) => p.status === "keyframed") || Object.values(u[g] ?? Tv).some((p) => p.type === "keyframed")), [u, d]), f = ll(m.some(Boolean)), v = e.map((x, g) => {
    const p = d[g], y = u[g] ?? Tv, C = Object.keys(y).length === 0 ? null : y, b = m[g] ? f : null, E = s?.prepared[g];
    if (E && E.definition === x.definition && E.sourceKey === x.effectKey && Ya(E.params, x.params) && E.propStatus === p && E.dragOverrides === C && E.frame === b)
      return E;
    const k = b2(p ?? void 0, f), { params: P, effectKey: F } = C2({
      descriptor: x,
      propStatusOverrides: k,
      dragOverrides: C,
      frame: f
    });
    return {
      definition: x.definition,
      sourceKey: x.effectKey,
      params: x.params !== null && typeof x.params == "object" && Object.getPrototypeOf(x.params) === Object.prototype ? { ...x.params } : x.params,
      propStatus: p,
      dragOverrides: C,
      frame: b,
      value: E?.value.definition === x.definition && E.value.effectKey === F ? E.value : {
        definition: x.definition,
        effectKey: F,
        params: P,
        memoized: !0
      }
    };
  }), w = s !== null && s.effects.length === v.length && s.effects.every((x, g) => x === v[g].value) ? s.effects : v.map((x) => x.value);
  return s1(() => {
    r.current = { prepared: v, effects: w };
  }, [w, v]), x2(w, o && a !== null ? ut({ ...a }) : null);
}, Qm = (e, t) => {
  const n = {};
  for (const r of Object.keys(e)) {
    const o = e[r];
    if (o.type !== "hidden")
      if (o.type === "enum") {
        n[r] = o;
        const i = t(r) ?? o.default, s = o.variants[i];
        s && Object.assign(n, Qm(s, t));
      } else
        n[r] = o;
  }
  return n;
}, Jm = (e) => {
  const t = {}, n = (r, o) => {
    r in t || (t[r] = o);
  };
  for (const r of Object.keys(e)) {
    const o = e[r];
    if (n(r, o), o.type === "enum")
      for (const i of Object.values(o.variants)) {
        const s = Jm(i);
        for (const a of Object.keys(s))
          n(a, s[a]);
      }
  }
  return t;
}, rn = /* @__PURE__ */ new Map(), kc = /* @__PURE__ */ new Map(), tf = /* @__PURE__ */ new Set(), Tu = /* @__PURE__ */ new Set(), Yi = Tu, uo = (e) => JSON.stringify([e.absolutePath, e.nodePath]), Ei = (e = !1) => {
  const t = new Set([...rn].filter(([, n]) => n.deleted).map(([n]) => n));
  if (!(!e && t.size === Yi.size && [...t].every((n) => Yi.has(n)))) {
    Yi = t.size === 0 ? Tu : t;
    for (const n of tf)
      n();
  }
}, P2 = (e) => (tf.add(e), () => {
  tf.delete(e);
}), Zm = () => {
  const e = ae(), t = $n(P2, () => Yi, () => Tu);
  return e.isStudio && !e.isRendering ? t : Tu;
}, Ru = {
  register: (e, t) => {
    if (e === null || t === null)
      return;
    const n = uo(t);
    kc.get(e) !== n && (kc.set(e, n), Yi.size > 0 && Ei(!0));
  },
  isDeleted: (e, t) => e !== null && t.has(uo(e)),
  isElementDeleted: (e, t) => {
    if (!l.isValidElement(e))
      return !1;
    const n = e.props._remotionInternalStack, r = n === void 0 ? void 0 : kc.get(n);
    return r !== void 0 && t.has(r);
  },
  set: (e, t, n) => {
    for (const r of e) {
      const o = uo(r), i = rn.get(o);
      i && i.revision > t || rn.set(o, { id: t, revision: t, deleted: n });
    }
    Ei();
  },
  rollback: (e, t) => {
    for (const n of e) {
      const r = uo(n);
      rn.get(r)?.revision === t && rn.delete(r);
    }
    Ei();
  },
  restore: (e, t, n) => {
    for (const r of e) {
      const o = uo(r), i = rn.get(o);
      i && i.revision <= t && rn.set(o, { ...i, revision: t, deleted: n });
    }
    Ei();
  },
  prepareRetirement: (e, t) => {
    const n = e.map((r) => {
      const o = uo(r);
      return { key: o, id: rn.get(o)?.id };
    });
    return () => {
      let r = !1;
      for (const { key: o, id: i } of n)
        i !== void 0 && i <= t && rn.get(o)?.id === i && (r = rn.delete(o) || r);
      r && Ei();
    };
  }
}, l1 = ({
  schema: e,
  key: t,
  value: n
}) => {
  const r = e[t];
  if (!r)
    throw new Error("Key " + JSON.stringify(t) + " not found in schema");
  if (typeof n != "string")
    throw new Error("Value must be a string, but is " + JSON.stringify(n));
  if (r.type !== "enum")
    throw new Error("Key " + JSON.stringify(t) + " is not an enum");
  if (!r.variants[n])
    throw new Error("Value for " + JSON.stringify(t) + " must be one of " + Object.keys(r.variants).map((a) => JSON.stringify(a)).join(", ") + ", got " + JSON.stringify(n));
  const i = Object.keys(r.variants).filter((a) => a !== n), s = /* @__PURE__ */ new Set();
  for (const a of i) {
    const u = r.variants[a], c = Object.keys(u);
    for (const d of c)
      s.add(d);
  }
  return [...s];
}, I2 = {
  type: "linear"
}, T2 = ({
  insertedKeyframeIndex: e,
  easingLength: t,
  keyframeCount: n
}) => !(e > 0 && e < n - 1) || t === 0 ? null : Math.min(e - 1, t - 1), R2 = (e) => ({ type: "static", value: e }), F2 = ({
  status: e,
  frame: t,
  value: n,
  defaultEasing: r = I2
}) => {
  const o = e.keyframes.findIndex((a) => a.frame === t), i = o === -1 ? [...e.keyframes, { frame: t, value: n }].sort((a, u) => a.frame - u.frame) : e.keyframes.map((a, u) => u === o ? { frame: t, value: n } : a), s = [...e.easing];
  if (o === -1) {
    const a = i.findIndex((d) => d.frame === t), u = T2({
      insertedKeyframeIndex: a,
      easingLength: s.length,
      keyframeCount: i.length
    }), c = u === null ? r : s[u];
    s.splice(a, 0, c);
  }
  for (; s.length < i.length - 1; )
    s.push(r);
  return s.length > i.length - 1 && (s.length = i.length - 1), {
    type: "keyframed",
    status: {
      ...e,
      keyframes: i,
      easing: s
    }
  };
}, M2 = (e) => {
  if (e?.type === "static")
    return e.value;
}, N2 = (e) => e !== null && e.status === "keyframed", c1 = (e, t) => {
  if (t in e)
    return e[t];
  for (const n of Object.values(e))
    if (n.type === "enum")
      for (const r of Object.values(n.variants)) {
        const o = c1(r, t);
        if (o)
          return o;
      }
}, d1 = ({
  schema: e,
  currentValue: t,
  overrideValues: n,
  propStatus: r,
  frame: o
}) => {
  const i = {}, s = /* @__PURE__ */ new Set();
  for (const a of Object.keys(t)) {
    const u = r?.[a] ?? null, c = c1(e, a);
    if (c?.type === "hidden")
      continue;
    let d;
    if (u === null) {
      const m = vs({
        dragOverrideValue: n[a],
        frame: o
      });
      d = m.type === "resolved" ? m.value : t[a];
    } else if (N2(u))
      if (c?.type === "array")
        d = t[a];
      else {
        const m = vs({
          dragOverrideValue: n[a],
          frame: o
        });
        m.type === "resolved" ? d = m.value : o !== null ? d = $s({
          forceSpringAllowTail: null,
          frame: Cl({ frame: o, status: u }),
          status: u
        }) ?? t[a] : d = t[a];
      }
    else u.status === "computed" ? d = t[a] : d = i1({
      propStatus: u,
      dragOverrideValue: n[a],
      defaultValue: c?.default,
      frame: o,
      shouldResortToDefaultValueIfUndefined: !1
    });
    c?.type === "asset" && typeof d == "string" && d.startsWith(Zu) && (d = Yw(d)), d === void 0 && s.add(a), i[a] = d;
  }
  for (const a of Object.keys(n))
    if (e[a]?.type === "enum") {
      const u = l1({
        schema: e,
        key: a,
        value: i[a]
      });
      for (const c of u)
        s.add(c);
    }
  return { merged: i, propsToDelete: s };
}, f1 = (e, t) => {
  const n = t.split(".");
  let r = e;
  for (const o of n) {
    if (r == null || typeof r != "object")
      return;
    r = r[o];
  }
  return r;
}, m1 = ({
  flatSchema: e,
  key: t,
  props: n
}) => {
  const r = f1(n, t);
  if (!((e[t]?.type === "string" || e[t]?.type === "text-content") && typeof r != "string"))
    return r;
}, $2 = (e, t, n) => {
  const r = {};
  for (const o of t)
    r[o] = n ? m1({ flatSchema: n, key: o, props: e }) : f1(e, o);
  return r;
}, _2 = (e, t) => Object.keys(Qm(e, (n) => t[n])), A2 = ({
  flatSchema: e,
  props: t,
  valuesDotNotation: n,
  schemaKeys: r,
  propsToDelete: o
}) => {
  const i = { ...t };
  for (const a of r) {
    const u = n[a];
    if ((e[a]?.type === "string" || e[a]?.type === "text-content") && u === void 0)
      continue;
    const c = a.split(".");
    if (c.length === 1) {
      i[a] = u;
      continue;
    }
    let d = i;
    for (let m = 0; m < c.length - 1; m++) {
      const f = c[m];
      typeof d[f] == "object" && d[f] !== null ? d[f] = { ...d[f] } : d[f] = {}, d = d[f];
    }
    d[c[c.length - 1]] = u;
  }
  const s = new Set([...o].filter((a) => !((e[a]?.type === "string" || e[a]?.type === "text-content") && n[a] === void 0)));
  return Tk(i, s), i;
}, p1 = l.createContext(!1), L2 = ({ children: e }) => D.createElement(p1.Provider, { value: !0 }, e), h1 = l.createContext(!1), O2 = ({ children: e }) => D.createElement(h1.Provider, { value: !0 }, e), $t = ({
  Component: e,
  componentName: t,
  componentIdentity: n = null,
  schema: r,
  supportsEffects: o
}) => {
  const i = ek(r), s = Jm(i), a = Object.keys(s), u = {}, c = l.forwardRef((d, m) => {
    const {
      _remotionInternalStack: f,
      ...v
    } = d, h = v, w = ae(), x = Zm(), g = l.useContext(fr), p = l.useContext(p1), y = l.useContext(h1);
    if (!w.isStudio && !y || w.isRendering || !g || p)
      return D.createElement(e, {
        ...h,
        controls: null,
        ref: m
      });
    const C = l.useContext(Ym), b = zr(), E = b?.durationInFrames, k = b?.fps, P = b?.height, F = b?.width, I = l.useMemo(() => E === void 0 || k === void 0 || P === void 0 || F === void 0 ? null : {
      durationInFrames: E,
      fps: k,
      height: P,
      width: F
    }, [E, k, P, F]), L = h.controls, _ = l.useMemo(() => {
      if (!L || sl(L) !== null || f === void 0)
        return L;
      const Q = { ...L };
      return sv(Q, f), Q;
    }, [f, L]);
    if (_)
      return D.createElement(e, {
        ...h,
        controls: _,
        ref: m
      });
    const [O] = l.useState(() => {
      if (!f)
        return String(Math.random());
      const Q = u[f];
      if (Q)
        return Q;
      const X = String(Math.random());
      return u[f] = X, X;
    }), N = w.isReadOnlyStudio ? null : C.overrideIdToNodePathMappings[O] ?? null, j = V0(N), V = z0(N), B = l.useMemo(() => u1(V, I), [V, I]), A = a.some((Q) => B?.[Q]?.status === "keyframed" || j[Q]?.type === "keyframed"), T = ll(A), M = a.map((Q) => m1({
      flatSchema: s,
      key: Q,
      props: h
    })), R = l.useMemo(() => $2(h, a, s), M), [$] = l.useState(() => ps(R));
    l.useLayoutEffect(() => {
      $.setSnapshot(R);
    }, [R, $]);
    const z = l.useMemo(() => {
      const Q = {
        schema: i,
        currentRuntimeValueDotNotation: R,
        runtimeValues: $.store,
        videoConfigValues: I,
        overrideId: O,
        supportsEffects: o,
        componentIdentity: n,
        componentName: t
      };
      return sv(Q, f), Q;
    }, [
      R,
      f,
      O,
      $.store,
      I
    ]);
    l.useLayoutEffect(() => {
      Ru.register(f ?? null, N);
    }, [f, N]);
    const { merged: q, propsToDelete: H } = l.useMemo(() => d1({
      schema: i,
      currentValue: R,
      overrideValues: j,
      propStatus: B,
      frame: T
    }), [R, j, B, T]), U = _2(i, q), K = A2({
      flatSchema: s,
      props: h,
      valuesDotNotation: q,
      schemaKeys: U,
      propsToDelete: H
    });
    return Ru.isDeleted(N, x) ? null : D.createElement(e, {
      ...K,
      controls: z,
      ref: m
    });
  });
  return c.displayName = `withInteractivitySchema(${e.displayName || e.name || "Component"})`, c;
}, Rv = l.createContext(!0), Fv = jr(ge.Provider), Pc = [], j2 = (e) => e, D2 = (e) => e, V2 = (e) => e.current, z2 = (e, t, n) => {
  t.current = n, typeof e == "function" ? e(n) : e && (e.current = n);
}, B2 = ({
  from: e = 0,
  trimBefore: t = 0,
  playbackRate: n = 1,
  loop: r = !1,
  freeze: o,
  durationInFrames: i,
  children: s,
  name: a,
  height: u,
  width: c,
  showInTimeline: d = !0,
  hidden: m = !1,
  controls: f,
  _remotionInternalEffects: v,
  _remotionInternalTimelineTrack: h,
  _remotionInternalLoopDisplay: w,
  _remotionInternalStack: x,
  _remotionInternalSingleChildComponent: g,
  _remotionInternalDocumentationLink: p,
  _remotionInternalPremountDisplay: y,
  _remotionInternalPostmountDisplay: C,
  _remotionInternalIsMedia: b,
  cropLeft: E,
  cropRight: k,
  cropTop: P,
  cropBottom: F,
  ...I
}, L) => {
  const { layout: _ = "absolute-fill" } = I, [O] = l.useState(() => String(Math.random())), N = l.useContext(ge), j = l.useContext(Ts), V = l.useContext(Gt), B = l.useContext(al), A = l.useRef(!1), T = ae(), M = j && T.isStudio && !T.isRendering, R = l.useContext(Ar), $ = h?.role ?? "clip", z = h?.seriesOffset ?? null, q = N?.playbackRate ?? 1, H = q * n, U = N ? N.cumulatedFrom + N.relativeFrom : 0;
  if (_ !== "absolute-fill" && _ !== "none")
    throw new TypeError(`The layout prop of <Sequence /> expects either "absolute-fill" or "none", but you passed: ${_}`);
  const K = { cropLeft: E, cropRight: k, cropTop: P, cropBottom: F }, Q = Object.values(K).some((tn) => tn !== void 0);
  if (_ === "none" && Q)
    throw new TypeError('The cropLeft, cropRight, cropTop and cropBottom props of <Sequence /> are only supported with layout="absolute-fill".');
  F0(K);
  const {
    left: X,
    right: J,
    top: oe,
    bottom: Z
  } = jm(K);
  if (_ === "none" && typeof I.style < "u")
    throw new TypeError('If layout="none", you may not pass a style. Passed: ' + JSON.stringify(I.style));
  const le = T0({
    durationInFrames: i
  });
  if (typeof le != "number")
    throw new TypeError(`You passed to durationInFrames an argument of type ${typeof le}, but it must be a number.`);
  if (le <= 0)
    throw new TypeError(`durationInFrames must be positive, but got ${le}`);
  if (typeof e != "number")
    throw new TypeError(`You passed to the "from" props of your <Sequence> an argument of type ${typeof e}, but it must be a number.`);
  if (!Number.isFinite(e))
    throw new TypeError(`The "from" prop of a sequence must be finite, but got ${e}.`);
  if (typeof t != "number")
    throw new TypeError(`You passed to the "trimBefore" prop of your <Sequence> an argument of type ${typeof t}, but it must be a number.`);
  if (t < 0)
    throw new TypeError(`The "trimBefore" prop of <Sequence /> must be greater than or equal to 0, but got ${t}.`);
  if (Number.isNaN(t))
    throw new TypeError('The "trimBefore" prop of <Sequence /> must be a real number, but it is NaN.');
  if (!Number.isFinite(t))
    throw new TypeError(`The "trimBefore" prop of <Sequence /> must be finite, but it is ${t}.`);
  if (typeof r != "boolean")
    throw new TypeError(`The "loop" prop of <Sequence /> must be a boolean, but is of type ${typeof r}.`);
  if (r && !Number.isFinite(le))
    throw new Error('The "loop" prop of <Sequence /> requires a finite "durationInFrames" prop, because a <Sequence /> has no intrinsic duration.');
  if (typeof o < "u" && o !== null) {
    if (typeof o != "number")
      throw new TypeError(`The "freeze" prop of <Sequence /> must be a number, but is of type ${typeof o}.`);
    if (Number.isNaN(o))
      throw new TypeError('The "freeze" prop of <Sequence /> must be a real number, but it is NaN.');
    if (!Number.isFinite(o))
      throw new TypeError(`The "freeze" prop of <Sequence /> must be finite, but it is ${o}.`);
  }
  const de = Hr(), pt = l.useRef({ playbackRate: n, frame: de });
  if (typeof n != "number" || !Number.isFinite(n) || n <= 0)
    throw new TypeError(`The "playbackRate" prop of <Sequence /> must be a positive finite number, but got ${n}.`);
  if (pt.current.frame !== de && pt.current.playbackRate !== n)
    throw new Error('The "playbackRate" prop of <Sequence /> must be constant. Animating playbackRate is not supported.');
  l.useLayoutEffect(() => {
    pt.current = { playbackRate: n, frame: de };
  }, [de, n]);
  const we = bt(), Re = Zt({
    durationInFrames: i,
    playbackRate: n,
    loop: r
  }), ee = e - t / n, Oe = N ? Math.min(N.durationInFrames - ee, Re) : Re, be = Math.max(0, Math.min(we.durationInFrames - e, Oe)), $e = (de - U) * q, ie = r && Number.isFinite(le) ? le / n : null;
  let Ee = 0;
  if (ie !== null && (!M || !V && $e >= e && $e < e + be)) {
    const tn = ($e - e) / ie, zp = Math.round(tn), ox = Math.abs(tn - zp) <= Number.EPSILON * Math.max(1, Math.abs(tn)) * 4, ix = Math.ceil(be / ie) - 1;
    Ee = Math.max(0, Math.min(ix, ox ? zp : Math.floor(tn)));
  }
  const pe = ie === null ? 0 : Ee * ie, Et = e + pe, je = (Et - t / n) / q, Ue = (N?.absoluteFrom ?? 0) + je, We = ie === null ? be * n + t : Math.min(ie, be - pe) * n + t, Lt = l.useContext(Xo), ot = l.useContext(Dm), ke = T.isStudio || ot, Ot = l.useMemo(() => ke && _ === "none" ? Vm.createRef() : null, [ke, _]), yn = l.useRef(null), wn = _ === "none" ? Ot : yn, Dn = l.useMemo(() => N?.premounting || !!I._remotionInternalIsPremounting, [I._remotionInternalIsPremounting, N?.premounting]), jt = l.useMemo(() => N?.postmounting || !!I._remotionInternalIsPostmounting, [I._remotionInternalIsPostmounting, N?.postmounting]), Xt = U + je, Qr = N ? N.cumulatedFrom + N.relativeFrom : 0, ht = N ? Qr - N.cumulatedNegativeFrom / q : 0, it = Math.max(0, ht, U + Et / q), Vn = (Xt - it) * H, zn = l.useMemo(() => ({
    playbackRate: H,
    absoluteFrom: Ue,
    cumulatedFrom: U,
    relativeFrom: je,
    cumulatedNegativeFrom: Vn,
    durationInFrames: We,
    parentFrom: N?.relativeFrom ?? 0,
    id: O,
    height: u ?? N?.height ?? null,
    width: c ?? N?.width ?? null,
    premounting: Dn,
    postmounting: jt,
    premountDisplay: y ?? null,
    postmountDisplay: C ?? null
  }), [
    U,
    Ue,
    je,
    H,
    We,
    N,
    O,
    u,
    c,
    Dn,
    jt,
    y,
    C,
    Vn
  ]), si = l.useMemo(() => ie === null ? null : {
    iteration: Ee,
    durationInFrames: le
  }, [le, Ee, ie]), Bn = l.useMemo(() => w || ie === null ? w : {
    numberOfTimes: be / ie,
    startOffset: 0,
    durationInFrames: ie
  }, [be, w, ie]), Jr = l.useMemo(() => a ?? "", [a]), Zr = p ?? "https://www.remotion.dev/docs/sequence", Xr = l.useContext(Ju), eo = l.useMemo(() => g === void 0 ? gm(s) : g, [s, g]), Vs = f ? sl(f) ?? x ?? null : x ?? null, to = l.useMemo(() => D2.bind(null, Vs), [Vs]), st = typeof o == "number" ? o : null, Un = st ?? (de - Xt) * H, ai = l.useRef(Un);
  l.useLayoutEffect(() => {
    ai.current = Un;
  }, [Un]);
  const no = l.useMemo(() => V2.bind(null, ai), [ai]), Sn = t === 0 ? null : t, ui = N?.cumulatedNegativeFrom ?? 0, jl = b && b.type !== "image" ? b.data.startMediaFrom + ui - Vn : null, li = b && b.type !== "image" ? b.data.startMediaFrom + ui : null, Dl = b && b.type !== "image" && li !== null ? st === null ? null : li + (Bn ? st % Bn.durationInFrames : st) * b.data.playbackRate : null, zs = f?.schema, ci = f?.runtimeValues, ro = f?.overrideId, re = f?.supportsEffects, te = f?.componentIdentity, Qe = f?.componentName, en = f?.videoConfigValues, Mp = $m(), Bs = (te === "dev.remotion.remotion.Series" || te === "dev.remotion.transitions.TransitionSeries") && !r && st === null && !Mp && !m, Np = Bs && i === void 0, $p = te === "dev.remotion.remotion.Series.Sequence" || te === "dev.remotion.transitions.TransitionSeries.Sequence" || te === "dev.remotion.transitions.TransitionSeries.Transition" || te === "dev.remotion.transitions.TransitionSeries.Overlay", JS = l.useContext(Rv), Us = l.useMemo(() => v?.runtimeValues ?? null, [v]), Ws = l.useMemo(() => zs === void 0 || ci === void 0 || ro === void 0 || re === void 0 || te === void 0 || Qe === void 0 || en === void 0 ? null : {
    schema: zs,
    runtimeValues: ci,
    overrideId: ro,
    supportsEffects: re,
    componentIdentity: te,
    componentName: Qe,
    videoConfigValues: en
  }, [
    te,
    Qe,
    en,
    ro,
    ci,
    zs,
    re
  ]), _p = l.useMemo(() => {
    const tn = R ? {
      timelineTrack: {
        ...R,
        role: $,
        seriesOffset: z
      }
    } : {};
    return b ? b.type === "image" ? {
      ...tn,
      sequencePlaybackRate: n,
      type: "image",
      controls: Ws,
      effects: v ?? Pc,
      effectRuntimeValues: Us,
      displayName: Jr,
      documentationLink: Zr,
      duration: be,
      from: e,
      trimBefore: Sn,
      id: O,
      loopDisplay: Bn,
      parent: N?.id ?? null,
      postmountDisplay: C ?? null,
      premountDisplay: y ?? null,
      showInTimeline: d,
      timelineOrder: null,
      src: b.src,
      getStack: to,
      getCurrentFrame: no,
      refForOutline: wn ?? null,
      isInsideSeries: Xr,
      frozenFrame: st,
      singleChildComponent: eo ?? null
    } : {
      ...tn,
      type: b.type,
      sequencePlaybackRate: n,
      controls: Ws,
      effects: v ?? Pc,
      effectRuntimeValues: Us,
      displayName: Jr,
      documentationLink: Zr,
      duration: be,
      from: e,
      trimBefore: Sn,
      id: O,
      loopDisplay: Bn,
      parent: N?.id ?? null,
      playbackRate: b.data.playbackRate,
      postmountDisplay: C ?? null,
      premountDisplay: y ?? null,
      showInTimeline: d,
      timelineOrder: null,
      src: b.data.src,
      getStack: to,
      getCurrentFrame: no,
      startMediaFrom: jl ?? b.data.startMediaFrom,
      mediaFrameAtSequenceZero: li,
      muted: b.data.muted,
      refForOutline: wn ?? null,
      isInsideSeries: Xr,
      frozenFrame: st,
      frozenMediaFrame: Dl,
      singleChildComponent: eo ?? null
    } : {
      ...tn,
      from: e,
      sequencePlaybackRate: n,
      trimBefore: Sn,
      duration: be,
      ...Np ? { autoDuration: !0 } : {},
      ...Bs ? { canInferDuration: !0 } : {},
      ...$p ? { unclippedDuration: Re } : {},
      id: O,
      displayName: Jr,
      documentationLink: Zr,
      parent: N?.id ?? null,
      type: "sequence",
      showInTimeline: d,
      timelineOrder: null,
      loopDisplay: Bn,
      getStack: to,
      getCurrentFrame: no,
      premountDisplay: y ?? null,
      postmountDisplay: C ?? null,
      controls: Ws,
      effects: v ?? Pc,
      effectRuntimeValues: Us,
      refForOutline: wn ?? null,
      isInsideSeries: Xr,
      frozenFrame: st,
      singleChildComponent: eo ?? null
    };
  }, [
    O,
    R,
    $,
    z,
    no,
    to,
    Jr,
    n,
    N?.id,
    be,
    Np,
    Bs,
    $p,
    Re,
    e,
    Sn,
    d,
    Bn,
    y,
    C,
    Ws,
    v,
    Us,
    b,
    Zr,
    wn,
    Xr,
    st,
    jl,
    li,
    Dl,
    eo
  ]), ZS = l.useMemo(() => j2.bind(null, _p), [_p]), qs = H0({
    getSequence: T.isStudio || Lt ? ZS : null,
    id: O
  }), XS = e + Re, Ap = C0({
    absoluteFrame: de,
    cumulatedFrom: U,
    from: e,
    parentPlaybackRate: q,
    durationInFrames: Re
  }), Vl = JS && $e - e >= -Ap && $e - XS < -Ap, zl = V || !Vl, ex = mk(M && !m ? {
    id: O,
    parent: N?.id ?? null,
    compositionId: we.id,
    from: it,
    end: U + (e + be) / q
  } : null), oo = M && (!zl || ex || B && A.current);
  (D.useInsertionEffect ?? l.useLayoutEffect)(() => {
    A.current = oo;
  }, [oo]);
  const Bl = (M ? oo : Vl) ? s : null, Ul = Bl === null || typeof o > "u" || o === null ? Bl : /* @__PURE__ */ S.jsx(vn, {
    frame: o,
    children: Bl
  }), Wl = Ul === null || si === null ? Ul : /* @__PURE__ */ S.jsx(Om.Provider, {
    value: si,
    children: Ul
  }), ql = I.layout === "none" ? void 0 : I.style, Hl = R0({
    left: X,
    right: J,
    top: oe,
    bottom: Z,
    style: ql
  }), tx = l.useMemo(() => z2.bind(null, L, yn), [L, yn]), nx = l.useMemo(() => ({
    flexDirection: void 0,
    ...c ? { width: c } : {},
    ...u ? { height: u } : {},
    ...ql ?? {},
    ...Hl ? {
      clipPath: Hl
    } : {}
  }), [Hl, u, ql, c]);
  if (L !== null && _ === "none")
    throw new TypeError('It is not supported to pass both a `ref` and `layout="none"` to <Sequence />.');
  const Lp = l.useMemo(() => ke || qs !== null ? {
    type: "sequence",
    id: O,
    value: qs,
    outlineChildrenRef: Ot
  } : null, [Ot, O, qs, ke]);
  if (m)
    return ke || qs !== null ? /* @__PURE__ */ S.jsx(Fv, {
      value: zn,
      _remotionCommitMetadata: Lp,
      children: null
    }) : null;
  const Op = T.isStudio && Bs, jp = oo ? /* @__PURE__ */ S.jsx(uk, {
    dormant: zl,
    children: Wl
  }) : Wl, Dp = Wl === null ? Op ? s : null : I.layout === "none" ? jp : /* @__PURE__ */ S.jsx(bs, {
    ref: tx,
    style: nx,
    className: I.className,
    children: jp
  }), Vp = oo ? /* @__PURE__ */ S.jsx(lk, {
    dormant: zl,
    frame: it,
    children: Dp
  }) : Dp, rx = /* @__PURE__ */ S.jsx(Fv, {
    value: zn,
    _remotionCommitMetadata: Lp,
    children: Op ? /* @__PURE__ */ S.jsx(Rv.Provider, {
      value: oo || Vl,
      children: Vp
    }) : Vp
  });
  return /* @__PURE__ */ S.jsx(Ar.Provider, {
    value: $ === "track" || $ === "clip" && !d ? R : null,
    children: rx
  });
}, v1 = l.forwardRef(B2), U2 = (e, t) => {
  if (e.layout === "none")
    throw new Error('`<Sequence>` with `premountFor` and `postmountFor` props does not support layout="none"');
  const {
    style: n,
    from: r = 0,
    durationInFrames: o,
    premountFor: i = 0,
    postmountFor: s = 0,
    styleWhilePremounted: a,
    styleWhilePostmounted: u,
    ...c
  } = e, {
    freezeFrame: d,
    isPremountingOrPostmounting: m,
    postmountingActive: f,
    premountingActive: v,
    premountingStyle: h
  } = gn({
    from: r,
    durationInFrames: Zt({
      durationInFrames: o,
      playbackRate: c.playbackRate,
      loop: c.loop
    }),
    premountFor: i,
    postmountFor: s,
    style: n ?? null,
    styleWhilePremounted: a ?? null,
    styleWhilePostmounted: u ?? null,
    hideWhilePremounted: "opacity"
  });
  return /* @__PURE__ */ S.jsx(vn, {
    frame: d,
    active: m,
    _remotionInternalIsPremounting: v,
    children: /* @__PURE__ */ S.jsx(v1, {
      ref: t,
      from: r,
      durationInFrames: o,
      style: h ?? void 0,
      _remotionInternalPremountDisplay: i,
      _remotionInternalPostmountDisplay: s,
      _remotionInternalIsPremounting: v,
      _remotionInternalIsPostmounting: f,
      ...c
    })
  });
}, W2 = l.forwardRef(U2), q2 = (e, t) => {
  const n = ae(), { fps: r } = bt(), o = l.useContext(Ur);
  if (e.layout !== "none" && !n.isRendering) {
    const i = e.premountFor ?? Math.round(o * r);
    if (i || e.postmountFor)
      return /* @__PURE__ */ S.jsx(W2, {
        ref: t,
        ...e,
        premountFor: i
      });
  }
  return /* @__PURE__ */ S.jsx(v1, {
    ...e,
    ref: t
  });
}, Xm = l.forwardRef(q2), bl = Xm, mt = $t({
  Component: Xm,
  componentName: "<Sequence>",
  componentIdentity: "dev.remotion.remotion.Sequence",
  schema: _r,
  supportsEffects: !1
});
$t({
  Component: Xm,
  componentName: "<Sequence>",
  componentIdentity: null,
  schema: ok,
  supportsEffects: !1
});
var H2 = {
  ...jn,
  ...Jt,
  ...At,
  ...Ln,
  ..._n,
  ...An,
  ...Rs,
  ...dl
}, K2 = (e, t) => {
  typeof e == "function" ? e(t) : e && (e.current = t);
}, G2 = ({
  ref: e,
  from: t,
  premountFor: n,
  postmountFor: r,
  styleWhilePremounted: o,
  styleWhilePostmounted: i,
  trimBefore: s,
  playbackRate: a,
  loop: u,
  freeze: c,
  durationInFrames: d,
  hidden: m,
  name: f,
  showInTimeline: v,
  stack: h,
  controls: w,
  children: x,
  ...g
}) => {
  const {
    effectivePremountFor: p,
    effectivePostmountFor: y,
    freezeFrame: C,
    isPremountingOrPostmounting: b,
    premountingActive: E,
    postmountingActive: k,
    premountingStyle: P
  } = gn({
    from: t ?? 0,
    durationInFrames: Zt({
      durationInFrames: d,
      playbackRate: a,
      loop: u
    }),
    premountFor: n ?? null,
    postmountFor: r ?? null,
    style: g.style ?? null,
    styleWhilePremounted: o ?? null,
    styleWhilePostmounted: i ?? null,
    hideWhilePremounted: "opacity"
  });
  return /* @__PURE__ */ S.jsx(vn, {
    frame: C,
    active: b,
    _remotionInternalIsPremounting: E,
    children: /* @__PURE__ */ S.jsx(mt, {
      layout: "none",
      from: t ?? 0,
      trimBefore: s,
      playbackRate: a,
      loop: u,
      freeze: c,
      durationInFrames: d,
      hidden: m,
      name: f ?? "<AbsoluteFill>",
      showInTimeline: v ?? !0,
      controls: w,
      _remotionInternalStack: h,
      _remotionInternalDocumentationLink: "https://www.remotion.dev/docs/absolute-fill",
      _remotionInternalPremountDisplay: p || null,
      _remotionInternalPostmountDisplay: y || null,
      _remotionInternalIsPremounting: E,
      _remotionInternalIsPostmounting: k,
      children: /* @__PURE__ */ S.jsx(bs, {
        ref: e,
        ...g,
        style: P ?? void 0,
        children: x
      })
    })
  });
}, Y2 = ({
  ref: e,
  from: t,
  premountFor: n,
  postmountFor: r,
  styleWhilePremounted: o,
  styleWhilePostmounted: i,
  trimBefore: s,
  playbackRate: a,
  loop: u,
  freeze: c,
  durationInFrames: d,
  hidden: m,
  name: f,
  showInTimeline: v,
  stack: h,
  controls: w,
  children: x,
  ...g
}) => {
  const p = zr(), y = l.useCallback((C) => {
    K2(e, C);
  }, [e]);
  return p === null ? m ? null : /* @__PURE__ */ S.jsx(bs, {
    ref: y,
    ...g,
    children: x
  }) : /* @__PURE__ */ S.jsx(G2, {
    ...g,
    ref: y,
    from: t,
    premountFor: n,
    postmountFor: r,
    styleWhilePremounted: o,
    styleWhilePostmounted: i,
    trimBefore: s,
    playbackRate: a,
    loop: u,
    freeze: c,
    durationInFrames: d,
    hidden: m,
    name: f,
    showInTimeline: v,
    stack: h,
    controls: w,
    children: x
  });
}, Q2 = $t({
  Component: Y2,
  componentName: "<AbsoluteFill>",
  componentIdentity: "dev.remotion.remotion.AbsoluteFill",
  schema: H2,
  supportsEffects: !1
});
Le(Q2);
var pr = ({
  cropLeft: e,
  cropRight: t,
  cropTop: n,
  cropBottom: r,
  style: o,
  componentName: i
}) => (F0({ cropLeft: e, cropRight: t, cropTop: n, cropBottom: r }, i), l.useMemo(() => {
  const s = R0({
    ...jm({ cropLeft: e, cropRight: t, cropTop: n, cropBottom: r }),
    style: o
  });
  return s === null ? o : { ...o, clipPath: s };
}, [r, e, t, n, o])), g1 = (e, t, n) => {
  switch (e) {
    case "fill":
      return [
        0,
        0,
        t.width,
        t.height,
        0,
        0,
        n.width,
        n.height
      ];
    case "contain": {
      const r = Math.min(n.width / t.width, n.height / t.height), o = (n.width - t.width * r) / 2, i = (n.height - t.height * r) / 2;
      return [
        0,
        0,
        t.width,
        t.height,
        o,
        i,
        t.width * r,
        t.height * r
      ];
    }
    case "cover": {
      const r = Math.max(n.width / t.width, n.height / t.height), o = (n.width - t.width * r) / 2, i = (n.height - t.height * r) / 2;
      return [
        0,
        0,
        t.width,
        t.height,
        o,
        i,
        t.width * r,
        t.height * r
      ];
    }
    default:
      throw new Error("Unknown fit: " + e);
  }
}, J2 = "https://remotion.dev/docs/troubleshooting/webgl2-context", y1 = (e, t) => `Failed to acquire ${e} context for ${t}. Pass --gl=angle when using the CLI, set chromiumOptions: { gl: "angle" } when using SSR APIs, or set "OpenGL render backend" to "angle" in the Advanced section when rendering in the Studio. See ${J2}`, Z2 = (e) => new Error(y1("WebGL", e)), w1 = (e) => new Error(y1("WebGL2", e));
class X2 {
  constructor(t, n, r) {
    ue(this, "width");
    ue(this, "height");
    ue(this, "pairs", /* @__PURE__ */ new Map());
    ue(this, "allocated", []);
    ue(this, "lostContexts", /* @__PURE__ */ new Set());
    ue(this, "onContextLost");
    ue(this, "disposed", !1);
    this.width = t, this.height = n, this.onContextLost = r;
  }
  getCanvas(t, n) {
    if (this.disposed)
      throw new Error("Effect chain state was used after it had been cleaned up");
    let r = this.pairs.get(t);
    return r || (r = [null, null], this.pairs.set(t, r)), r[n] ?? (r[n] = this.allocateCanvas(t)), r[n];
  }
  getPair(t) {
    return this.getCanvas(t, 0), this.getCanvas(t, 1), this.pairs.get(t);
  }
  assertContextNotLost(t) {
    if (this.lostContexts.has(t))
      throw new Error("WebGL context was lost during canvas effect rendering. This typically happens in headless or memory-constrained environments (e.g. Remotion Lambda). Try reducing concurrency or increasing the Lambda function memory.");
  }
  dispose() {
    if (!this.disposed) {
      this.disposed = !0;
      for (const { canvas: t, gl: n } of this.allocated)
        n?.getExtension("WEBGL_lose_context")?.loseContext(), t.width = 0, t.height = 0;
      this.allocated.length = 0, this.pairs.clear(), this.lostContexts.clear();
    }
  }
  allocateCanvas(t) {
    const n = document.createElement("canvas");
    switch (n.width = this.width, n.height = this.height, t) {
      case "2d": {
        if (!n.getContext("2d", {
          colorSpace: "srgb"
        }))
          throw new Error("Failed to acquire 2D context for canvas effect");
        return this.allocated.push({ canvas: n, gl: null }), n;
      }
      case "webgl2": {
        const r = n.getContext("webgl2", {
          premultipliedAlpha: !0,
          alpha: !0,
          preserveDrawingBuffer: !0
        });
        if (!r)
          throw w1("canvas effect");
        return n.addEventListener("webglcontextlost", (o) => {
          this.disposed || (o.preventDefault(), this.lostContexts.add(n), this.onContextLost(n));
        }), n.addEventListener("webglcontextrestored", () => {
          this.disposed || (r.pixelStorei(r.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !0), this.lostContexts.delete(n));
        }), r.pixelStorei(r.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !0), this.allocated.push({ canvas: n, gl: r }), n;
      }
      case "webgpu": {
        if (typeof navigator > "u" || !("gpu" in navigator))
          throw new Error("WebGPU is not available in this environment for canvas effect");
        return this.allocated.push({ canvas: n, gl: null }), n;
      }
      default: {
        const r = t;
        throw new Error(`Unknown effect backend: ${r}`);
      }
    }
  }
}
var eP = (e) => {
  const t = [];
  let n = [], r = null;
  for (const o of e) {
    const { backend: i } = o.definition;
    r === null || i === r ? (n.push(o), r = i) : (t.push({ backend: r, effects: n }), n = [o], r = i);
  }
  return r !== null && n.length > 0 && t.push({ backend: r, effects: n }), t;
}, wa = null, tP = () => wa || (wa = (async () => {
  if (typeof navigator > "u" || !("gpu" in navigator))
    throw new Error("WebGPU is not available in this environment");
  const { gpu: e } = navigator, t = await e.requestAdapter();
  if (!t)
    throw new Error("No WebGPU adapter available");
  return t.requestDevice();
})(), wa), S1 = (e, t) => {
  const n = {
    width: e,
    height: t,
    pool: new X2(e, t, (r) => {
      const o = n.cleanupRegistry.filter((i) => i.target === r);
      n.cleanupRegistry = n.cleanupRegistry.filter((i) => i.target !== r);
      for (const i of o)
        n.setupCache.get(i.definition)?.delete(r);
      for (const i of o)
        i.definition.cleanup(i.state);
    }),
    setupCache: /* @__PURE__ */ new WeakMap(),
    cleanupRegistry: [],
    currentRunId: 0
  };
  return n;
}, nf = (e) => {
  e.currentRunId++, S2(e);
  try {
    for (const t of e.cleanupRegistry)
      t.definition.cleanup(t.state);
  } finally {
    e.cleanupRegistry.length = 0, e.pool.dispose();
  }
}, nP = (e, t, n) => {
  const r = t;
  let o = e.setupCache.get(r);
  if (o || (o = /* @__PURE__ */ new WeakMap(), e.setupCache.set(r, o)), o.has(n))
    return o.get(n);
  const i = t.setup(n);
  return o.set(n, i), e.cleanupRegistry.push({ definition: r, state: i, target: n }), i;
}, Mv = async ({ state: e, source: t, effects: n, output: r, width: o, height: i }, s, a) => {
  const u = () => e.currentRunId !== a, c = n.filter((p) => !p.params.disabled), d = eP(c);
  let m = t, f = null;
  if (d.length === 0) {
    if (t === r)
      return !0;
    const p = r.getContext("2d");
    if (!p)
      throw new Error("Failed to acquire 2D context for output canvas");
    return p.clearRect(0, 0, o, i), p.drawImage(m, 0, 0, o, i), !0;
  }
  let v = !1;
  for (const p of d)
    if (p.backend === "webgpu") {
      v = !0;
      break;
    }
  const h = v ? await tP() : null;
  if (u())
    return !1;
  let w = s, x = null;
  try {
    for (let p = 0; p < d.length; p++) {
      const y = d[p];
      let C = 0;
      for (const E of y.effects) {
        const k = e.pool.getCanvas(y.backend, C), P = E.definition;
        y.backend === "webgl2" && e.pool.assertContextNotLost(k);
        const F = nP(e, P, k);
        w2(E, m, e), P.apply({
          source: m,
          target: k,
          state: F,
          params: E.params,
          width: e.width,
          height: e.height,
          gpuDevice: h,
          flipSourceY: y.backend === "webgl2" ? w : !1
        }), x?.close(), x = null, y.backend === "webgl2" && (w = !0), m = k, C = C === 0 ? 1 : 0;
      }
      f = m ?? f;
      const b = d[p + 1];
      if (b && b.backend !== y.backend && f)
        if (y.backend === "2d" && b.backend === "webgl2")
          m = f, w = !0;
        else {
          if (x = await createImageBitmap(f), u())
            return !1;
          m = x, b.backend === "webgl2" && (w = !1);
        }
    }
  } finally {
    x?.close();
  }
  if (!f)
    return !0;
  const g = r.getContext("2d");
  if (!g)
    throw new Error("Failed to acquire 2D context for output canvas");
  return g.clearRect(0, 0, o, i), g.drawImage(f, 0, 0, o, i), !0;
}, Ls = async (e) => {
  const { state: t, source: n, width: r, height: o, effects: i } = e, s = ++t.currentRunId;
  if (t.width === r && t.height === o || !i.some((c) => !c.params.disabled))
    return Mv(e, !0, s);
  const a = i.find((c) => !c.params.disabled), u = await createImageBitmap(n, {
    resizeWidth: t.width,
    resizeHeight: t.height,
    imageOrientation: a.definition.backend === "webgl2" ? "flipY" : "none"
  });
  try {
    return t.currentRunId !== s ? !1 : await Mv({ ...e, source: u }, !1, s);
  } finally {
    u.close();
  }
}, Os = (e = null) => {
  const t = e?.width, n = e?.height;
  e && (Ko(t, "effectsOutputSize.width", "on an effect-capable component"), Ko(n, "effectsOutputSize.height", "on an effect-capable component"));
  const r = l.useRef(null), o = l.useRef(null), i = l.useRef(!1);
  return l.useEffect(() => (i.current = !1, () => {
    i.current = !0, r.current && (nf(r.current), r.current = null, o.current = null);
  }), []), l.useMemo(() => ({
    get: (s, a) => (s = t ?? s, a = n ?? a, i.current ? null : ((!o.current || o.current.width !== s || o.current.height !== a) && (r.current && nf(r.current), r.current = S1(s, a), o.current = { width: s, height: a }), r.current))
  }), [t, n]);
}, rP = ({ width: e, height: t, fit: n, className: r, style: o, effects: i, effectsOutputSize: s, ...a }, u) => {
  const c = l.useRef(null), d = Os(s), m = l.useMemo(() => typeof document > "u" ? null : document.createElement("canvas"), []), f = l.useCallback((v) => {
    const h = c.current, w = e ?? v.displayWidth, x = t ?? v.displayHeight;
    if (!h)
      throw new Error("Canvas ref is not set");
    if (!m)
      throw new Error("Source canvas is not available");
    m.width = w, m.height = x;
    const g = m.getContext("2d");
    if (!g)
      throw new Error("Could not get 2d context for source canvas");
    return g.drawImage(v, ...g1(n, {
      height: v.displayHeight,
      width: v.displayWidth
    }, {
      width: w,
      height: x
    })), h.width = w, h.height = x, Ls({
      state: d.get(w, x),
      source: m,
      effects: i,
      output: h,
      width: w,
      height: x
    });
  }, [d, i, n, t, m, e]);
  return l.useImperativeHandle(u, () => ({
    draw: f,
    getCanvas: () => {
      if (!c.current)
        throw new Error("Canvas ref is not set");
      return c.current;
    },
    clear: () => {
      const v = c.current?.getContext("2d");
      if (!v)
        throw new Error("Could not get 2d context");
      v.clearRect(0, 0, c.current.width, c.current.height);
    }
  }), [f]), /* @__PURE__ */ S.jsx("canvas", {
    ref: c,
    className: r,
    style: o,
    ...a
  });
}, oP = D.forwardRef(rP), x1 = async ({
  resolvedSrc: e,
  signal: t,
  requestInit: n,
  contentType: r
}) => {
  if (typeof ImageDecoder > "u")
    throw new Error("Your browser does not support the WebCodecs ImageDecoder API.");
  const o = await fetch(e, { ...n, signal: t }), { body: i } = o;
  if (!i)
    throw new Error("Got no body");
  const s = new ImageDecoder({
    data: i,
    type: r ?? o.headers.get("Content-Type") ?? "image/gif"
  });
  await Promise.all([s.completed, s.tracks.ready]);
  const { selectedTrack: a } = s.tracks;
  if (!a)
    throw s.close(), new Error("No selected track");
  return { decoder: s, selectedTrack: a };
}, iP = 5, Nv = ({
  loopBehavior: e,
  durationFound: t,
  timeInSec: n
}) => e === "loop" ? t ? n % t : n : Math.min(n, t || 1 / 0), sP = async ({
  resolvedSrc: e,
  signal: t,
  requestInit: n,
  currentTime: r,
  initialLoopBehavior: o
}) => {
  const { decoder: i, selectedTrack: s } = await x1({
    resolvedSrc: e,
    signal: t,
    requestInit: n,
    contentType: null
  }), a = [];
  let u = null;
  const c = async (v) => {
    const h = a.find((x) => x.frameIndex === v);
    if (h && h.frame)
      return h;
    const w = await i.decode({
      frameIndex: v,
      completeFramesOnly: !0
    });
    return h ? h.frame = w.image : a.push({
      frame: w.image,
      frameIndex: v,
      timeInSeconds: w.image.timestamp / 1e6
    }), {
      frame: w.image,
      frameIndex: v,
      timeInSeconds: w.image.timestamp / 1e6
    };
  }, d = (v) => {
    const w = a.filter((x) => x.frame).sort((x, g) => {
      const p = Math.abs(x.timeInSeconds - v), y = Math.abs(g.timeInSeconds - v);
      return p - y;
    });
    for (let x = 0; x < w.length; x++) {
      if (x < iP)
        continue;
      const g = w[x];
      g.frame?.close(), g.frame = null;
    }
  }, m = async ({
    timeInSec: v,
    loopBehavior: h
  }) => {
    const w = Nv({
      durationFound: u,
      loopBehavior: h,
      timeInSec: v
    }), g = a.filter((y) => y.timeInSeconds <= w).map((y) => y.frameIndex).reduce((y, C) => Math.max(y, C), 0);
    let p = g;
    for (; ; ) {
      const y = await c(p);
      if (p++, !y.frame)
        throw new Error("No frame found");
      if (!y.frame.duration || (p === s.frameCount && u === null && (u = (y.frame.timestamp + y.frame.duration) / 1e6), y.timeInSeconds > w || p === s.frameCount))
        break;
    }
    s.frameCount - g < 3 && h === "loop" && await c(0), d(w);
  };
  return await m({
    timeInSec: r,
    loopBehavior: o
  }), await m({
    timeInSec: r,
    loopBehavior: o
  }), {
    close: () => {
      for (const v of a)
        v.frame?.close(), v.frame = null;
      i.close();
    },
    getFrame: async (v, h) => {
      if (u !== null && v > u && h === "clear-after-finish")
        return null;
      const w = Nv({
        loopBehavior: h,
        durationFound: u,
        timeInSec: v
      });
      await m({ timeInSec: w, loopBehavior: h });
      const g = a.filter((p) => p.frame).reduce((p, y) => {
        const C = Math.abs(p.timeInSeconds - w), b = Math.abs(y.timeInSeconds - w);
        return C < b ? p : y;
      });
      if (!g.frame)
        throw new Error("No frame found");
      return g;
    },
    frameCount: s.frameCount
  };
}, aP = ({
  frame: e,
  playbackRate: t,
  fps: n
}) => e * t / n, C1 = async ({
  resolvedSrc: e,
  signal: t,
  requestInit: n,
  contentType: r
}) => {
  const { decoder: o, selectedTrack: i } = await x1({
    resolvedSrc: e,
    signal: t,
    requestInit: n,
    contentType: r
  });
  try {
    const { image: s } = await o.decode({
      frameIndex: i.frameCount - 1,
      completeFramesOnly: !0
    });
    try {
      if (s.duration === null)
        throw new Error("Could not determine animated image duration");
      return (s.timestamp + s.duration) / 1e6;
    } finally {
      s.close();
    }
  } finally {
    o.close();
  }
}, b1 = (e) => {
  if (!e)
    return null;
  const t = { ...e };
  delete t.signal;
  const { headers: n, ...r } = t;
  return JSON.stringify({
    ...r,
    headers: n ? Array.from(new Headers(n).entries()) : null
  });
}, ep = (e) => typeof window > "u" ? e : new URL(e, document.baseURI).href, uP = {
  src: {
    type: "asset",
    assetType: "image",
    default: void 0,
    description: "Source",
    keyframable: !1
  },
  ...jn,
  loop: nk,
  ...On,
  ...Jt,
  ...At,
  ...Ln,
  ..._n,
  ...An
}, lP = (e) => {
  const t = {}, n = t;
  for (const r in e)
    Object.prototype.hasOwnProperty.call(e, r) && (r.startsWith("data-") || r.startsWith("aria-")) && (n[r] = e[r]);
  return t;
}, E1 = l.forwardRef(({
  src: e,
  width: t,
  height: n,
  onError: r,
  loopBehavior: o = "loop",
  playbackRate: i = 1,
  fit: s = "fill",
  requestInit: a,
  effects: u,
  effectsOutputSize: c,
  controls: d,
  ...m
}, f) => {
  const v = ep(e), [h, w] = l.useState(null), x = h?.decoder ?? null, g = l.useRef(null), { delayRender: p, continueRender: y, cancelRender: C } = _t(), b = hn(), { fps: E } = bt(), k = aP({ frame: b, playbackRate: i, fps: E }), P = l.useRef(k);
  P.current = k;
  const F = b1(a), I = l.useRef(a);
  I.current = a;
  const L = l.useRef(null), _ = As({
    effects: u,
    overrideId: d?.overrideId ?? null,
    videoConfigValues: d?.videoConfigValues ?? null
  });
  l.useImperativeHandle(f, () => {
    const N = L.current?.getCanvas();
    if (!N)
      throw new Error("Canvas ref is not set");
    return N;
  }, []);
  const [O] = l.useState(() => o);
  return l.useLayoutEffect(() => {
    const N = p(`Rendering <AnimatedImage/> with src="${v}"`), j = new AbortController();
    let V = !1, B = !1, A = null;
    const T = () => {
      B || (B = !0, y(N));
    };
    return sP({
      resolvedSrc: v,
      signal: j.signal,
      requestInit: I.current,
      currentTime: P.current,
      initialLoopBehavior: O
    }).then((M) => {
      if (V) {
        M.close();
        return;
      }
      A = M, g.current = M, w({ decoder: M, handle: N });
    }).catch((M) => {
      if (!V) {
        if (M.name === "AbortError") {
          T();
          return;
        }
        r ? (r?.(M), T()) : C(M);
      }
    }), () => {
      V = !0, g.current = null, A?.close(), j.abort(), T();
    };
  }, [
    v,
    r,
    F,
    O,
    y,
    p,
    C
  ]), l.useLayoutEffect(() => {
    if (!x || !h || g.current !== x)
      return;
    const N = p(`Rendering frame at ${k} of <AnimatedImage src="${e}"/>`);
    y(h.handle);
    let j = !1;
    return x.getFrame(k, o).then(async (V) => {
      if (j)
        return;
      if (V === null) {
        L.current?.clear(), y(N);
        return;
      }
      await L.current?.draw(V.frame) && !j && y(N);
    }).catch((V) => {
      j || (r ? (r(V), y(N)) : C(V));
    }), () => {
      j = !0, y(N);
    };
  }, [
    k,
    x,
    h,
    o,
    r,
    e,
    y,
    p,
    _,
    s,
    t,
    n,
    C,
    c?.width,
    c?.height
  ]), /* @__PURE__ */ S.jsx(oP, {
    ref: L,
    width: t,
    height: n,
    fit: s,
    effects: _,
    effectsOutputSize: c ?? null,
    ...m
  });
});
E1.displayName = "AnimatedImageContent";
var k1 = ({
  src: e,
  width: t,
  height: n,
  onError: r,
  fit: o,
  playbackRate: i,
  loopBehavior: s,
  id: a,
  className: u,
  style: c,
  durationInFrames: d,
  from: m,
  premountFor: f,
  postmountFor: v,
  styleWhilePremounted: h,
  styleWhilePostmounted: w,
  cropLeft: x,
  cropRight: g,
  cropTop: p,
  cropBottom: y,
  requestInit: C,
  effects: b = [],
  effectsOutputSize: E,
  controls: k,
  ref: P,
  ...F
}) => {
  const I = l.useRef(null), L = _s(b);
  l.useImperativeHandle(P, () => I.current, []);
  const {
    effectivePostmountFor: _,
    effectivePremountFor: O,
    freezeFrame: N,
    isPremountingOrPostmounting: j,
    postmountingActive: V,
    premountingActive: B,
    premountingStyle: A
  } = gn({
    from: m ?? 0,
    durationInFrames: Zt({
      durationInFrames: d,
      playbackRate: i,
      loop: F.loop
    }),
    premountFor: f ?? null,
    postmountFor: v ?? null,
    style: c ?? null,
    styleWhilePremounted: h ?? null,
    styleWhilePostmounted: w ?? null,
    hideWhilePremounted: "display-none"
  }), T = pr({
    cropLeft: x,
    cropRight: g,
    cropTop: p,
    cropBottom: y,
    style: A,
    componentName: "<AnimatedImage />"
  }), M = lP(F), R = {
    src: e,
    width: t,
    height: n,
    onError: r,
    fit: o,
    loopBehavior: s,
    id: a,
    className: u,
    style: T ?? void 0,
    requestInit: C,
    ...M
  };
  return /* @__PURE__ */ S.jsx(vn, {
    frame: N,
    active: j,
    _remotionInternalIsPremounting: B,
    children: /* @__PURE__ */ S.jsx(mt, {
      layout: "none",
      from: m ?? 0,
      playbackRate: i,
      durationInFrames: d,
      name: "<AnimatedImage>",
      _remotionInternalDocumentationLink: "https://www.remotion.dev/docs/animatedimage",
      controls: k,
      _remotionInternalEffects: L,
      _remotionInternalPremountDisplay: O || null,
      _remotionInternalPostmountDisplay: _ || null,
      _remotionInternalIsPremounting: B,
      _remotionInternalIsPostmounting: V,
      ...F,
      children: /* @__PURE__ */ S.jsx(Wr, {
        children: /* @__PURE__ */ S.jsx(E1, {
          ...R,
          ref: I,
          effects: b,
          effectsOutputSize: E ?? null,
          controls: k
        })
      })
    })
  });
}, cP = (e) => {
  const { fps: t } = bt(), { delayRender: n, continueRender: r, cancelRender: o } = _t(), { src: i, requestInit: s, trimBefore: a } = e, u = l.useRef(s);
  u.current = s;
  const c = l.useRef(e.onError);
  c.current = e.onError;
  const [d, m] = l.useState(null), [f, v] = l.useState(null);
  return l.useLayoutEffect(() => {
    const h = n(`Finding duration of <AnimatedImage src="${i}" />`), w = new AbortController();
    let x = !1;
    return C1({
      resolvedSrc: ep(i),
      signal: w.signal,
      requestInit: u.current,
      contentType: null
    }).then((g) => {
      x || m({
        durationInFrames: Math.ceil(g * t) - (a ?? 0),
        handle: h
      });
    }).catch((g) => {
      x || (c.current ? (c.current(g), v(h)) : o(g));
    }), () => {
      x = !0, w.abort(), r(h);
    };
  }, [o, r, n, t, i, a]), l.useLayoutEffect(() => {
    d !== null && r(d.handle), f !== null && r(f);
  }, [r, d, f]), d === null || f !== null ? null : /* @__PURE__ */ S.jsx(k1, {
    ...e,
    durationInFrames: d.durationInFrames
  });
}, dP = (e) => {
  if (e.loop && e.durationInFrames === void 0) {
    const t = ep(e.src), n = b1(e.requestInit);
    return /* @__PURE__ */ l.createElement(cP, {
      ...e,
      key: `${t}-${n}-${e.trimBefore ?? 0}`
    });
  }
  return /* @__PURE__ */ S.jsx(k1, {
    ...e
  });
}, P1 = $t({
  Component: dP,
  componentName: "<AnimatedImage>",
  componentIdentity: "dev.remotion.remotion.AnimatedImage",
  schema: uP,
  supportsEffects: !0
});
P1.displayName = "AnimatedImage";
Le(P1);
var fP = {
  type: "boolean",
  default: !1,
  description: "Disabled"
}, mP = (e) => {
  const { calculateKey: t, validateParams: n } = e, r = {
    ...e,
    documentationLink: e.documentationLink ?? null,
    calculateKey: (i) => {
      const s = i.disabled ?? !1;
      return `${t(i)}-disabled-${s}`;
    },
    schema: {
      disabled: fP,
      ...e.schema
    }
  };
  return (i = {}) => (n(i), {
    definition: r,
    params: i,
    effectKey: r.calculateKey(i),
    memoized: !1
  });
}, pP = (e) => {
  if (typeof e != "string")
    throw new TypeError(`The "filename" must be a string, but you passed a value of type ${typeof e}`);
  if (e.trim() === "")
    throw new Error("The `filename` must not be empty");
  if (!e.match(/^([0-9a-zA-Z-!_.*'()/:&$@=;+,?]+)/g))
    throw new Error('The `filename` must match "/^([0-9a-zA-Z-!_.*\'()/:&$@=;+,?]+)/g". Use forward slashes only, even on Windows.');
}, hP = (e) => {
  if (typeof e != "string" && !(e instanceof Uint8Array))
    throw new TypeError(`The "content" must be a string or Uint8Array, but you passed a value of type ${typeof e}`);
  if (typeof e == "string" && e.trim() === "")
    throw new Error("The `content` must not be empty");
}, I1 = (e) => {
  e.type === "artifact" && (pP(e.filename), e.contentType !== "thumbnail" && hP(e.content));
}, Gr = l.createContext({
  registerRenderAsset: () => {
  },
  unregisterRenderAsset: () => {
  },
  renderAssets: []
}), vP = ({ children: e, collectAssets: t }) => {
  const [n, r] = l.useState([]), o = l.useRef([]), i = l.useCallback((u) => {
    I1(u), o.current = [...o.current, u], r(o.current);
  }, []);
  t && l.useImperativeHandle(t, () => ({
    collectAssets: () => {
      const u = o.current;
      return o.current = [], r([]), u;
    }
  }), []);
  const s = l.useCallback((u) => {
    o.current = o.current.filter((c) => c.id !== u), r(o.current);
  }, []);
  l.useLayoutEffect(() => {
    typeof window < "u" && (window.remotion_collectAssets = () => {
      const u = o.current;
      return o.current = [], r([]), u;
    });
  }, []);
  const a = l.useMemo(() => ({
    registerRenderAsset: i,
    unregisterRenderAsset: s,
    renderAssets: n
  }), [n, i, s]);
  return /* @__PURE__ */ S.jsx(Gr.Provider, {
    value: a,
    children: e
  });
}, pn = (e) => typeof window > "u" || e.startsWith("http://") || e.startsWith("https://") || e.startsWith("file://") || e.startsWith("blob:") || e.startsWith("data:") ? e : new URL(e, document.baseURI).href, El = ({
  trimAfter: e,
  mediaDurationInFrames: t,
  playbackRate: n,
  trimBefore: r
}) => {
  let o = t;
  return typeof e < "u" && (o = e), typeof r < "u" && (o -= r), o / n;
}, tp = ({
  durationInFrames: e,
  trimAfter: t,
  trimBefore: n
}) => {
  const r = e === void 0 ? void 0 : (n ?? 0) + e;
  return r === void 0 ? t : t === void 0 ? r : Math.min(t, r);
}, T1 = l.createContext(null), gP = () => D.useContext(Om), kl = ({
  durationInFrames: e,
  times: t = 1 / 0,
  children: n,
  name: r,
  showInTimeline: o,
  playbackRate: i,
  ...s
}) => {
  const a = hn(), { durationInFrames: u } = bt(), c = l.useContext(ge), d = c?.playbackRate ?? 1, f = e / (i ?? 1), v = c ? c.cumulatedFrom + c.relativeFrom : 0, h = v - (c?.cumulatedNegativeFrom ?? 0) / d, w = v + Math.min(u, f * t) / d;
  if (Vr(e, {
    component: "of the <Loop /> component",
    allowFloats: !0
  }), typeof t != "number")
    throw new TypeError(`You passed to "times" an argument of type ${typeof t}, but it must be a number.`);
  if (t !== 1 / 0 && t % 1 !== 0)
    throw new TypeError(`The "times" prop of a loop must be an integer, but got ${t}.`);
  if (t < 0)
    throw new TypeError(`The "times" prop of a loop must be at least 0, but got ${t}`);
  const x = Math.ceil(u / f), g = Math.min(x, t), p = f * (g - 1), y = a / f, C = Math.round(y), b = Math.abs(y - C) <= Number.EPSILON * Math.max(1, Math.abs(y)) * 4, E = Math.max(0, Math.min(g - 1, b ? C : Math.floor(y))), k = b ? a : E * f, P = Math.max(0, Math.min(k, p)), F = l.useMemo(() => ({
    numberOfTimes: Math.min(u / f, t),
    startOffset: -P,
    durationInFrames: f
  }), [u, P, f, t]), I = l.useMemo(() => ({
    iteration: E,
    durationInFrames: e
  }), [E, e]), L = l.useMemo(() => ({
    startFrame: v,
    firstVisibleFrame: h,
    endFrame: w,
    playbackRate: d
  }), [v, h, w, d]);
  return g === 0 ? null : /* @__PURE__ */ S.jsx(T1.Provider, {
    value: L,
    children: /* @__PURE__ */ S.jsx(Om.Provider, {
      value: I,
      children: /* @__PURE__ */ S.jsx(mt, {
        durationInFrames: e,
        from: P,
        name: r ?? "<Loop>",
        _remotionInternalDocumentationLink: "https://www.remotion.dev/docs/loop",
        _remotionInternalLoopDisplay: F,
        ...s,
        showInTimeline: o,
        playbackRate: i,
        children: n
      })
    })
  });
};
kl.useLoop = gP;
var Ge = ({
  logLevel: e,
  tag: t,
  message: n,
  mountTime: r
}) => {
  const o = [r ? Date.now() - r + "ms " : null, t].filter(Boolean).join(" ");
  Te.trace({ logLevel: e, tag: null }, `[${o}]`, n);
}, Pl = l.createContext({}), $v = {}, Ic = [], R1 = ({ children: e }) => {
  const [t, n] = l.useState(() => $v);
  return l.useEffect(() => {
    const r = () => {
      n($v);
    };
    return Ic.push(r), () => {
      Ic = Ic.filter((o) => o !== r);
    };
  }, []), /* @__PURE__ */ S.jsx(Pl.Provider, {
    value: t,
    children: e
  });
}, F1 = (e) => {
  const t = e.indexOf("#");
  return t === -1 ? null : t;
}, yP = (e) => {
  const t = F1(e);
  return t === null ? e : e.slice(0, t);
}, Yr = (e) => {
  const t = l.useContext(Pl), n = F1(e), r = yP(e);
  return t[r] ? n !== null ? t[r] + e.slice(n) : t[r] : e;
}, Il = (e, t) => {
  if (typeof e.volume != "number" && typeof e.volume != "function" && typeof e.volume < "u")
    throw new TypeError(`You have passed a volume of type ${typeof e.volume} to your <${t} /> component. Volume must be a number or a function with the signature '(frame: number) => number' undefined.`);
  if (typeof e.volume == "number" && e.volume < 0)
    throw new TypeError(`You have passed a volume below 0 to your <${t} /> component. Volume must be between 0 and 1`);
  if (typeof e.playbackRate != "number" && typeof e.playbackRate < "u")
    throw new TypeError(`You have passed a playbackRate of type ${typeof e.playbackRate} to your <${t} /> component. Playback rate must a real number or undefined.`);
  if (typeof e.playbackRate == "number" && (isNaN(e.playbackRate) || !Number.isFinite(e.playbackRate) || e.playbackRate <= 0))
    throw new TypeError(`You have passed a playbackRate of ${e.playbackRate} to your <${t} /> component. Playback rate must be a real number above 0.`);
  if (typeof e.preservePitch != "boolean" && typeof e.preservePitch < "u")
    throw new TypeError(`'preservePitch' must be a boolean or undefined but got '${typeof e.preservePitch}' instead`);
}, wP = (e, t) => {
  if (typeof e < "u") {
    if (typeof e != "number")
      throw new TypeError(`type of startFrom prop must be a number, instead got type ${typeof e}.`);
    if (isNaN(e) || e === 1 / 0)
      throw new TypeError("startFrom prop can not be NaN or Infinity.");
    if (e < 0)
      throw new TypeError(`startFrom must be greater than equal to 0 instead got ${e}.`);
  }
  if (typeof t < "u") {
    if (typeof t != "number")
      throw new TypeError(`type of endAt prop must be a number, instead got type ${typeof t}.`);
    if (isNaN(t))
      throw new TypeError("endAt prop can not be NaN.");
    if (t <= 0)
      throw new TypeError(`endAt must be a positive number, instead got ${t}.`);
  }
  if (t < e)
    throw new TypeError("endAt prop must be greater than startFrom prop.");
}, SP = (e, t) => {
  if (typeof e < "u") {
    if (typeof e != "number")
      throw new TypeError(`type of trimBefore prop must be a number, instead got type ${typeof e}.`);
    if (isNaN(e) || e === 1 / 0)
      throw new TypeError("trimBefore prop can not be NaN or Infinity.");
    if (e < 0)
      throw new TypeError(`trimBefore must be greater than equal to 0 instead got ${e}.`);
  }
  if (typeof t < "u") {
    if (typeof t != "number")
      throw new TypeError(`type of trimAfter prop must be a number, instead got type ${typeof t}.`);
    if (isNaN(t))
      throw new TypeError("trimAfter prop can not be NaN.");
    if (t <= 0)
      throw new TypeError(`trimAfter must be a positive number, instead got ${t}.`);
  }
  if (t <= e)
    throw new TypeError("trimAfter prop must be greater than trimBefore prop.");
}, Tl = ({
  startFrom: e,
  endAt: t,
  trimBefore: n,
  trimAfter: r
}) => {
  if (typeof e < "u" && typeof n < "u")
    throw new TypeError("Cannot use both startFrom and trimBefore props. Use trimBefore instead as startFrom is deprecated.");
  if (typeof t < "u" && typeof r < "u")
    throw new TypeError("Cannot use both endAt and trimAfter props. Use trimAfter instead as endAt is deprecated.");
  typeof n < "u" || typeof r < "u" ? SP(n, r) : (typeof e < "u" || typeof t < "u") && wP(e, t);
}, Rl = ({
  startFrom: e,
  endAt: t,
  trimBefore: n,
  trimAfter: r
}) => ({ trimBeforeValue: n ?? e ?? void 0, trimAfterValue: r ?? t ?? void 0 }), xP = (e, t) => {
  switch (t.type) {
    case "got-duration": {
      const n = pn(t.src);
      return e[n] === t.durationInSeconds ? e : {
        ...e,
        [n]: t.durationInSeconds
      };
    }
    default:
      return e;
  }
}, M1 = (e, t, n) => {
  e({ type: "got-duration", durationInSeconds: n, src: t });
}, np = l.createContext({
  durations: {},
  setDurations: () => {
    throw new Error("context missing");
  }
}), N1 = ({ children: e }) => {
  const [t, n] = l.useReducer(xP, {}), r = l.useMemo(() => ({
    durations: t,
    setDurations: n
  }), [t]);
  return /* @__PURE__ */ S.jsx(np.Provider, {
    value: r,
    children: e
  });
}, rp = ({
  crossOrigin: e,
  requestsVideoFrame: t,
  isClientSideRendering: n
}) => {
  if (e != null)
    return e;
  if (n || t)
    return "anonymous";
};
function _v(e) {
  let t = e + 1831565813;
  return t = Math.imul(t ^ t >>> 15, t | 1), t ^= t + Math.imul(t ^ t >>> 7, t | 61), ((t ^ t >>> 14) >>> 0) / 4294967296;
}
function CP(e) {
  let t = 0, n = 0, r = 0;
  for (t = 0; t < e.length; t++)
    n = e.charCodeAt(t), r = (r << 5) - r + n, r |= 0;
  return r;
}
var js = (e, t) => {
  if (e === null)
    return Math.random();
  if (typeof e == "string")
    return _v(CP(e));
  if (typeof e == "number")
    return _v(e * 1e10);
  throw new Error("random() argument must be a number or a string");
}, Fu = ({
  mediaRef: e,
  mediaType: t,
  onAutoPlayError: n,
  logLevel: r,
  mountTime: o,
  reason: i,
  isPlayer: s
}) => {
  const { current: a } = e;
  if (!a)
    return;
  Ge({
    logLevel: r,
    tag: "play",
    message: `Attempting to play ${a.src}. Reason: ${i}`,
    mountTime: o
  });
  const u = a.play();
  u.catch && u.catch((c) => {
    if (a && !c.message.includes("request was interrupted by a call to pause") && !c.message.includes("The operation was aborted.") && !c.message.includes("The fetching process for the media resource was aborted by the user agent") && !c.message.includes("request was interrupted by a new load request") && !c.message.includes("because the media was removed from the document") && !(c.message.includes("user didn't interact with the document") && a.muted) && (console.log(`Could not play ${t} due to following error: `, c), !a.muted)) {
      if (n) {
        n();
        return;
      }
      t === "video" && s && (Te.info({ logLevel: r, tag: "<" + t + ">" }, "The video will be muted and we'll retry playing it."), Te.info({ logLevel: r, tag: "<" + t + ">" }, "Use onAutoPlayError() to handle this error yourself."), a.muted = !0, a.play());
    }
  });
}, op = ({
  audioContext: e,
  ref: t
}) => {
  let n = null, r = !1, o = e;
  return {
    setAudioContext: (i) => {
      o = i;
    },
    attemptToConnect: () => {
      if (r)
        throw new Error("SharedElementSourceNode has been disposed");
      !n && t.current && o && (n = o.createMediaElementSource(t.current));
    },
    get: () => {
      if (!n)
        throw new Error("Audio element not connected");
      return n;
    },
    cleanup: () => {
      n && (n.disconnect(), n = null), r = !0;
    }
  };
}, Av = !1, bP = (e) => {
  Av || (Av = !0, typeof window < "u" && Te.warn({ logLevel: e, tag: null }, "AudioContext is not supported in this browser"));
}, EP = ({
  logLevel: e,
  latencyHint: t,
  audioEnabled: n,
  sampleRate: r
}) => {
  const o = ae(), i = l.useRef(r);
  if (r !== i.current)
    throw new Error(`Changing the AudioContext sample rate dynamically is not supported. The sample rate was initialized with ${i.current} Hz, but ${r} Hz was passed later.`);
  return l.useMemo(() => {
    if (o.isRendering || !n)
      return null;
    if (typeof AudioContext > "u")
      return bP(e), null;
    const a = new AudioContext({
      latencyHint: t,
      sampleRate: r
    }), u = a.createGain();
    u.connect(a.destination), Te.trace({ logLevel: e, tag: "audio" }, "Creating new audio context"), a.suspend();
    let c = null, d = 0, m = null;
    return {
      audioContext: a,
      gainNode: u,
      getState: () => {
        const w = a.state;
        return c === "running" && w !== "running" ? "suspended-to-running" : c === "suspended" && w !== "suspended" ? "running-to-suspended" : w;
      },
      resume: () => {
        const w = ++d;
        c = "running";
        const x = a.resume();
        return m = x, x.finally(() => {
          m === x && (m = null), d === w && (c = null);
        });
      },
      suspend: () => {
        const w = ++d;
        return c = "suspended", (m ? m.catch(() => {
        }).then(() => {
          if (d === w)
            return a.suspend();
        }) : a.suspend()).finally(() => {
          d === w && (c = null);
        });
      }
    };
  }, [e, t, o.isRendering, n, r]);
}, kP = 1e3, PP = (e, t, n, r) => new Promise((o) => {
  const i = e.currentTime, a = e.getOutputTimestamp().performanceTime, u = performance.now();
  let c = null, d = null, m = !1, f = () => {
  };
  const v = (x) => {
    m || (m = !0, c !== null && cancelAnimationFrame(c), d !== null && clearTimeout(d), n.removeEventListener("abort", f), o(x));
  };
  f = () => v("cancelled");
  const h = (x) => {
    const g = e.getOutputTimestamp();
    return x !== void 0 && g.performanceTime !== void 0 && g.performanceTime > x && g.contextTime !== void 0 && g.contextTime > i;
  }, w = () => {
    c = null;
    const { currentTime: x } = e, g = e.getOutputTimestamp(), p = performance.now() - u;
    if (h(a)) {
      Te.verbose({ logLevel: t, tag: "audio" }, `waitUntilActuallyResumed: getOutputTimestamp.performanceTime advanced from ${a.toFixed(6)} to ${g.performanceTime?.toFixed(6)} after ${p.toFixed(1)}ms. currentTime=${x.toFixed(6)} (advanced by ${(x - i).toFixed(6)}), getOutputTimestamp.performanceTime=${g.performanceTime?.toFixed(1) ?? "undefined"}`), v("resumed");
      return;
    }
    c = requestAnimationFrame(w);
  };
  if (n.aborted) {
    v("cancelled");
    return;
  }
  n.addEventListener("abort", f, { once: !0 }), r && (d = setTimeout(() => {
    if (h(a)) {
      v("resumed");
      return;
    }
    Te.warn({ logLevel: t, tag: "audio" }, "WARNING: You enabled autoPlay on an unmuted <Player /> and the browser did not allow the video to be started. Remotion muted the <Player /> so it can play. To properly handle this, either set the `muted` prop or remove the `autoPlay` prop"), v("failed");
  }, kP)), c = requestAnimationFrame(w);
}), Tc = "data:audio/mp3;base64,/+MYxAAJcAV8AAgAABn//////+/gQ5BAMA+D4Pg+BAQBAEAwD4Pg+D4EBAEAQDAPg++hYBH///hUFQVBUFREDQNHmf///////+MYxBUGkAGIMAAAAP/29Xt6lUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxDUAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV", IP = (e, t) => {
  const n = Object.keys(e).sort(), r = Object.keys(t).sort();
  if (n.length !== r.length)
    return !1;
  for (let o = 0; o < n.length; o++)
    if (n[o] !== r[o] || e[n[o]] !== t[r[o]])
      return !1;
  return !0;
}, TP = (e, t, n) => e === "src" && !n.startsWith("data:") && !t.startsWith("data:") ? new URL(n, document.baseURI).toString() !== new URL(t, document.baseURI).toString() : n !== t, ei = l.createContext(null), Fl = l.createContext(null), RP = (e) => {
  if (e === "suspended" || e === "running-to-suspended" || e === "interrupted")
    return !0;
  if (e === "running" || e === "suspended-to-running")
    return !1;
  throw new Error(`Unexpected audio context state: ${e}`);
}, $1 = ({
  children: e,
  audioLatencyHint: t,
  audioEnabled: n,
  previewSampleRate: r,
  _experimentalKeepAudioContextAlive: o
}) => {
  const i = Yt(), s = r ?? 48e3, a = EP({
    logLevel: i,
    latencyHint: t,
    audioEnabled: n,
    sampleRate: s
  }), u = l.useRef(!1);
  if (l.useRef(o).current !== o)
    throw new Error("`_experimentalKeepAudioContextAlive` cannot be changed dynamically.");
  const d = l.useRef(null), m = l.useRef(0), f = l.useRef(!1), v = l.useMemo(() => ({ value: 0 }), []), h = l.useRef([]), w = l.useMemo(() => ({
    dispatch: (F) => {
      h.current.forEach((I) => I(F));
    },
    subscribe: (F) => (h.current.push(F), {
      remove: () => {
        h.current = h.current.filter((I) => I !== F);
      }
    })
  }), []), x = l.useRef({ scheduledEndTime: null, mediaEndTime: null }), g = l.useRef(/* @__PURE__ */ new Map()), p = l.useCallback((F) => g.current.delete(F), []), y = l.useMemo(() => ({
    node: F,
    mediaTimestamp: I,
    sourceOffset: L,
    scheduledTime: _,
    duration: O,
    offset: N,
    originalUnloopedMediaTimestamp: j
  }) => {
    if (!a)
      throw new Error("Audio context not found");
    const V = a.getState();
    if (V === "closed")
      return {
        type: "not-started",
        reason: "audio context is closed"
      };
    const B = RP(V) || o && !u.current;
    O > 0 && (B ? g.current.set(F, {
      scheduledTime: _,
      offset: N,
      duration: O
    }) : F.start(_, N, O));
    const A = _ + O / F.playbackRate.value, T = I + N - L, M = T + O, R = a.audioContext.baseLatency + a.audioContext.outputLatency, $ = _ - a.audioContext.currentTime, z = x.current, q = z.scheduledEndTime !== null && Math.abs(_ - z.scheduledEndTime) > 1e-3, H = z.mediaEndTime !== null && Math.abs(T - z.mediaEndTime) > 1e-3;
    return Te.verbose({ logLevel: i, tag: "audio-scheduling" }, "scheduled %c%s%c %s %c%s%c %s %c%s%c %s %s %s %s %s", q ? "color: red; font-weight: bold" : "", _.toFixed(4), "", A.toFixed(4), H ? "color: red; font-weight: bold" : "", T.toFixed(4), "", M.toFixed(4), O < 0 || $ < 0 ? "color: red; font-weight: bold" : "color: blue; font-weight: bold", O < 0 ? "missed " + Math.abs(N).toFixed(2) + "s" : Math.abs($).toFixed(2) + ($ < 0 ? " delay" : " ahead"), "", "current=" + a.audioContext.currentTime.toFixed(4), "offset=" + N.toFixed(4), "latency=" + R.toFixed(4), "state=" + a.audioContext.state, j !== T ? "original_ts=" + j.toFixed(4) : "", "action=" + (B ? "schedule" : "start"), ""), z.scheduledEndTime = A, z.mediaEndTime = M, O > 0 ? {
      type: "started",
      scheduledTime: _
    } : {
      type: "not-started",
      reason: "missed " + Math.abs(N).toFixed(2) + "s"
    };
  }, [a, o, i]), C = l.useCallback(() => {
    const F = f.current;
    if (f.current = !1, !a || u.current || (u.current = !0, a.gainNode.gain.cancelScheduledValues(a.audioContext.currentTime), a.gainNode.gain.setValueAtTime(0, a.audioContext.currentTime), a.gainNode.gain.linearRampToValueAtTime(1, a.audioContext.currentTime + 0.03), g.current.forEach((N, j) => {
      j.start(N.scheduledTime, N.offset, N.duration);
    }), g.current.clear(), o && a.audioContext.state === "running"))
      return Promise.resolve();
    const I = a.resume(), L = new AbortController(), _ = m.current++, O = new Promise((N) => {
      PP(a.audioContext, i, L.signal, F).then(N), I.catch((j) => {
        Te.warn({ logLevel: i, tag: "audio" }, "AudioContext resume rejected, muting playback and continuing without audio", j), L.abort(), N("failed");
      });
    }).finally(() => {
      d.current?.id === _ && (d.current = null);
    });
    return d.current = {
      abortController: L,
      id: _,
      promise: O
    }, I.catch(() => {
    });
  }, [a, o, i]), b = l.useCallback(() => (f.current = !0, C()), [C]), E = l.useCallback(() => d.current?.promise ?? null, []), k = l.useCallback(() => (d.current?.abortController.abort(), !a || !u.current ? Promise.resolve() : (u.current = !1, o ? (a.gainNode.gain.cancelScheduledValues(a.audioContext.currentTime), a.gainNode.gain.setValueAtTime(0, a.audioContext.currentTime), Promise.resolve()) : a.suspend())), [a, o]);
  l.useEffect(() => {
    if (!o || !a || typeof window > "u")
      return;
    const F = () => {
      a.audioContext.state !== "running" && a.resume().catch(() => {
      });
    };
    return F(), window.addEventListener("pointerdown", F, {
      capture: !0,
      passive: !0
    }), window.addEventListener("keydown", F, { capture: !0, passive: !0 }), () => {
      window.removeEventListener("pointerdown", F, { capture: !0 }), window.removeEventListener("keydown", F, { capture: !0 }), a.suspend().catch(() => {
      });
    };
  }, [a, o]);
  const P = l.useMemo(() => ({
    sampleRate: s,
    audioContext: a?.audioContext ?? null,
    getAudioContextState: () => a?.getState() ?? null,
    gainNode: a?.gainNode ?? null,
    audioSyncAnchor: v,
    audioSyncAnchorEmitter: w,
    scheduleAudioNode: y,
    resume: C,
    resumeAsAutoPlay: b,
    suspend: k,
    getIsResumingAudioContext: E,
    unscheduleAudioNode: p,
    _experimentalKeepAudioContextAlive: o
  }), [
    s,
    a,
    v,
    w,
    y,
    C,
    b,
    k,
    E,
    p,
    o
  ]);
  return /* @__PURE__ */ S.jsx(ei.Provider, {
    value: P,
    children: e
  });
}, _1 = ({ children: e, numberOfAudioTags: t }) => {
  const n = l.useRef([]), [r] = l.useState(t);
  if (t !== r)
    throw new Error("The number of shared audio tags has changed dynamically. Once you have set this property, you cannot change it afterwards.");
  const o = Yt(), i = ks(), s = ae(), a = l.useContext(ei), u = a?.audioContext ?? null, c = a?.resume, [d] = l.useState(() => new Array(t).fill(!0).map(() => {
    const C = l.createRef();
    return {
      id: Math.random(),
      ref: C,
      mediaElementSourceNode: op({
        audioContext: u,
        ref: C
      })
    };
  }));
  for (const { mediaElementSourceNode: C } of d)
    C?.setAudioContext(u);
  (D.useInsertionEffect ?? D.useLayoutEffect)(() => () => {
    requestAnimationFrame(() => {
      d.forEach(({ mediaElementSourceNode: C }) => {
        C?.cleanup();
      });
    });
  }, [d]);
  const f = l.useRef(new Array(t).fill(!1)), v = l.useCallback(() => {
    d.forEach(({ ref: C, id: b }) => {
      const E = n.current?.find((P) => P.id === b), { current: k } = C;
      if (k) {
        if (E === void 0) {
          k.src !== Tc && (k.src = Tc);
          return;
        }
        if (!E)
          throw new TypeError("Expected audio data to be there");
        Object.keys(E.props).forEach((P) => {
          TP(P, E.props[P], k[P]) && (k[P] = E.props[P]);
        });
      }
    });
  }, [d]), h = l.useCallback((C) => {
    const { aud: b, audioId: E, premounting: k, postmounting: P } = C, F = n.current?.find((V) => V.audioId === E);
    if (F)
      return F;
    const I = f.current.findIndex((V) => V === !1);
    if (I === -1)
      throw new Error(`Tried to simultaneously mount ${t + 1} <Html5Audio /> tags at the same time. With the current settings, the maximum amount of <Html5Audio /> tags is limited to ${t} at the same time. Remotion pre-mounts silent audio tags to help avoid browser autoplay restrictions. See https://remotion.dev/docs/player/autoplay#using-the-numberofsharedaudiotags-prop for more information on how to increase this limit.`);
    const { id: L, ref: _, mediaElementSourceNode: O } = d[I], N = [...f.current];
    N[I] = L, f.current = N;
    const j = {
      props: b,
      id: L,
      el: _,
      audioId: E,
      mediaElementSourceNode: O,
      premounting: k,
      audioMounted: !!_.current,
      postmounting: P,
      cleanupOnMediaTagUnmount: () => {
      }
    };
    return n.current?.push(j), v(), j;
  }, [t, d, v]), w = l.useCallback((C) => {
    const b = [...f.current], E = d.findIndex((k) => k.id === C);
    if (E === -1)
      throw new TypeError(`Unknown audio ref ${C}; refs: ${d.map((k) => k.id).join(", ")}`);
    b[E] = !1, f.current = b, n.current = n.current?.filter((k) => k.id !== C), v();
  }, [d, v]), x = l.useCallback(({
    aud: C,
    audioId: b,
    id: E,
    premounting: k,
    postmounting: P
  }) => {
    let F = !1;
    n.current = n.current?.map((I) => {
      const L = !!I.el.current;
      return I.audioMounted !== L && (F = !0), I.id === E ? IP(C, I.props) && I.premounting === k && I.postmounting === P ? I.audioMounted === L ? I : { ...I, audioMounted: L } : (F = !0, {
        ...I,
        props: C,
        premounting: k,
        postmounting: P,
        audioId: b,
        audioMounted: L
      }) : I.audioMounted === L ? I : { ...I, audioMounted: L };
    }), F && v();
  }, [v]), g = l.useCallback(() => {
    d.forEach((C) => {
      n.current.find((E) => E.el === C.ref)?.premounting || Fu({
        mediaRef: C.ref,
        mediaType: "audio",
        onAutoPlayError: null,
        logLevel: o,
        mountTime: i,
        reason: "playing all audios",
        isPlayer: s.isPlayer
      });
    }), c?.();
  }, [o, i, d, s.isPlayer, c]), p = l.useMemo(() => ({
    registerAudio: h,
    unregisterAudio: w,
    updateAudio: x,
    playAllAudios: g,
    numberOfAudioTags: t
  }), [
    t,
    g,
    h,
    w,
    x
  ]), y = l.useMemo(() => d.map(({ id: C, ref: b }) => /* @__PURE__ */ S.jsx("audio", {
    ref: b,
    preload: "metadata",
    src: Tc
  }, C)), [d]);
  return /* @__PURE__ */ S.jsxs(Fl.Provider, {
    value: p,
    children: [
      y,
      e
    ]
  });
}, FP = (e, t) => {
  e && e.numberOfAudioTags > 0 && e.unregisterAudio(t);
}, MP = ({
  aud: e,
  audioId: t,
  premounting: n,
  postmounting: r
}) => {
  const o = l.useContext(ei), i = l.useContext(Fl), [s] = l.useState(() => {
    if (i && i.numberOfAudioTags > 0)
      return i.registerAudio({ aud: e, audioId: t, premounting: n, postmounting: r });
    const u = D.createRef(), c = op({
      audioContext: o?.audioContext ?? null,
      ref: u
    });
    return {
      el: u,
      id: Math.random(),
      props: e,
      audioId: t,
      mediaElementSourceNode: c,
      premounting: n,
      audioMounted: !!u.current,
      postmounting: r,
      cleanupOnMediaTagUnmount: () => {
        c?.cleanup();
      }
    };
  });
  s.mediaElementSourceNode?.setAudioContext(o?.audioContext ?? null);
  const a = D.useInsertionEffect ?? D.useLayoutEffect;
  return typeof document < "u" && (a(() => {
    i && i.numberOfAudioTags > 0 && i.updateAudio({
      id: s.id,
      aud: e,
      audioId: t,
      premounting: n,
      postmounting: r
    });
  }, [e, i, s.id, t, n, r]), a(() => FP.bind(null, i, s.id), [i, s.id])), s;
}, NP = 1e-5, Mu = (e, t) => Math.abs(e - t) < NP, A1 = (e, t) => Math.round(e / t * 100) / 100, rf = () => typeof window > "u" || !/AppleWebKit/.test(window.navigator.userAgent) ? !1 : !window.navigator.userAgent.includes("Chrome/"), Ml = () => {
  if (typeof window > "u")
    return !1;
  const { userAgent: e, platform: t, maxTouchPoints: n } = window.navigator, r = /iP(ad|od|hone)/i.test(e), o = t === "MacIntel" && n > 1;
  return (r || o) && rf();
}, $P = (e) => Ml() && e.startsWith("blob:"), of = ({
  actualFrom: e,
  fps: t
}) => A1(Math.max(0, -e), t), sf = ({
  duration: e,
  fps: t
}) => A1(e, t), _P = ({
  actualSrc: e,
  actualFrom: t,
  duration: n,
  fps: r
}) => {
  if ($P(e) || e.startsWith("data:") || !!new URL(e, (typeof window > "u" ? null : window.location.href) ?? "http://localhost:3000").hash || !Number.isFinite(t))
    return e;
  const i = `${e}#t=${of({ actualFrom: t, fps: r })}`;
  return Number.isFinite(n) ? `${i},${sf({ duration: n, fps: r })}` : i;
}, AP = ({
  prevStartFrom: e,
  newStartFrom: t,
  prevDuration: n,
  newDuration: r,
  fps: o
}) => {
  const i = of({ actualFrom: e, fps: o }), s = of({ actualFrom: t, fps: o }), a = sf({ duration: n, fps: o }), u = sf({ duration: r, fps: o });
  return !(s < i || u > a);
}, LP = ({
  actualSrc: e,
  actualFrom: t,
  duration: n,
  fps: r
}) => {
  const o = l.useRef(t), i = l.useRef(n), s = l.useRef(e);
  return (!AP({
    prevStartFrom: o.current,
    newStartFrom: t,
    prevDuration: i.current,
    newDuration: n,
    fps: r
  }) || e !== s.current) && (o.current = t, i.current = n, s.current = e), _P({
    actualSrc: s.current,
    actualFrom: o.current,
    duration: i.current,
    fps: r
  });
}, Lv = !1, OP = (e) => {
  Lv || (Lv = !0, Te.warn({ logLevel: e, tag: null }, "In Safari, setting a volume and a playback rate at the same time is buggy."), Te.warn({ logLevel: e, tag: null }, "In Desktop Safari, only volumes <= 1 will be applied."), Te.warn({ logLevel: e, tag: null }, e, "In Mobile Safari, the volume will be ignored and set to 1 if a playbackRate is set."));
}, L1 = ({
  mediaRef: e,
  volume: t,
  logLevel: n,
  source: r,
  shouldUseWebAudioApi: o
}) => {
  const i = l.useRef(null), s = l.useRef(t);
  s.current = t;
  const a = l.useContext(ei);
  if (!a)
    throw new Error("useAmplification must be used within a SharedAudioContext");
  const { audioContext: u, gainNode: c } = a;
  if (typeof window < "u" && l.useLayoutEffect(() => {
    if (!u || !e.current || !o)
      return;
    if (e.current.playbackRate !== 1 && rf()) {
      OP(n);
      return;
    }
    if (!r || !c)
      return;
    const f = new GainNode(u, {
      gain: s.current
    });
    return r.attemptToConnect(), r.get().connect(f), f.connect(c), i.current = {
      gainNode: f
    }, Te.trace({ logLevel: n, tag: null }, `Starting to amplify ${e.current?.src}. Gain = ${s.current}, playbackRate = ${e.current?.playbackRate}`), () => {
      i.current = null, f.disconnect(), r.get().disconnect();
    };
  }, [
    n,
    e,
    u,
    r,
    o,
    c
  ]), i.current) {
    const f = t;
    Mu(i.current.gainNode.gain.value, f) || (i.current.gainNode.gain.value = f, Te.trace({ logLevel: n, tag: null }, `Setting gain to ${f} for ${e.current?.src}`));
  }
  return (rf() && e.current && e.current?.playbackRate !== 1 || !o) && e.current && !Mu(t, e.current?.volume) && (e.current.volume = Math.min(t, 1)), i;
}, jP = (e, t, n) => {
  const { current: r } = e;
  if (!r)
    return;
  if (r.duration) {
    t.current?.(n ?? r.src, r.duration);
    return;
  }
  const o = () => {
    t.current?.(n ?? r.src, r.duration);
  };
  return r.addEventListener("loadedmetadata", o), () => {
    r.removeEventListener("loadedmetadata", o);
  };
}, O1 = (e, t, n, r) => {
  const o = l.useRef(t);
  o.current = t, l.useEffect(jP.bind(null, e, o, r ? null : n), [e, n, r]);
}, j1 = (e) => {
  requestAnimationFrame(() => e?.());
}, hr = l.createContext(0), ip = () => l.useContext(ge)?.cumulatedNegativeFrom ?? 0, ti = (e) => {
  const t = kl.useLoop(), n = l.useContext(T1), r = l.useContext(ge), o = hn(), i = ip();
  return e === "repeat" || t === null ? o + i : o + i + t.durationInFrames * t.iteration * (r?.playbackRate ?? 1) / (n?.playbackRate ?? 1);
}, sp = (e) => {
  if (e.startsWith("data:"))
    return "Data URL";
  if (e.startsWith("blob:")) {
    const r = typeof window > "u" ? void 0 : window.remotion_staticFiles?.find((o) => o.src === e);
    return r ? sp(r.name) : "Blob URL";
  }
  const t = e.split("/").map((r) => r.split("\\")).flat(1), n = t[t.length - 1];
  try {
    return decodeURIComponent(n);
  } catch {
    return n;
  }
}, DP = ({
  compositionDurationInFrames: e,
  playbackRate: t,
  trimBefore: n,
  trimAfter: r,
  parentSequenceDurationInFrames: o,
  loop: i
}) => {
  if (i)
    return e;
  const s = El({
    mediaDurationInFrames: e * t + (n ?? 0),
    playbackRate: t,
    trimBefore: n,
    trimAfter: r
  });
  if (o !== null) {
    const a = Math.min(o, s);
    return Number(a.toFixed(10));
  }
  return s;
}, VP = [], D1 = ({
  src: e,
  displayName: t,
  trimBefore: n,
  trimAfter: r,
  playbackRate: o,
  sequenceDurationInFrames: i,
  mediaStartsAt: s,
  loop: a,
  muted: u
}) => {
  if (!e)
    throw new Error("No src passed");
  const c = l.useContext(ge), d = DP({
    compositionDurationInFrames: i,
    playbackRate: o,
    trimBefore: n,
    trimAfter: r,
    parentSequenceDurationInFrames: c?.durationInFrames ?? null,
    loop: a
  }), m = 0 - s + (n ?? 0);
  return l.useMemo(() => ({
    duration: d,
    finalDisplayName: t ?? sp(e),
    startMediaFrom: m,
    src: e,
    playbackRate: o,
    muted: u
  }), [d, t, e, m, o, u]);
}, ap = ({
  src: e,
  mediaType: t,
  playbackRate: n,
  displayName: r,
  id: o,
  getStack: i,
  showInTimeline: s,
  premountDisplay: a,
  postmountDisplay: u,
  loopDisplay: c,
  documentationLink: d,
  muted: m
}) => {
  const f = l.useContext(ge), v = l.useContext(Ar), h = l.useContext(hr), w = l.useContext(Xo), { durationInFrames: x } = bt(), g = ip(), p = l.useContext(Dm), { isStudio: y } = ae(), C = i(), b = l.useCallback(() => C, [C]), E = l.useMemo(() => t === "video" && (y || p) ? Vm.createRef() : null, [p, y, t]), { duration: k, finalDisplayName: P } = D1({
    src: e,
    displayName: r,
    trimAfter: void 0,
    trimBefore: void 0,
    playbackRate: n,
    sequenceDurationInFrames: x,
    mediaStartsAt: g,
    loop: !1,
    muted: m
  }), F = l.useCallback(() => {
    if (!e)
      throw new Error("No src passed");
    return {
      effectRuntimeValues: null,
      ...v ? {
        timelineTrack: {
          ...v,
          role: "clip",
          seriesOffset: null
        }
      } : {},
      type: t,
      src: e,
      id: o,
      duration: k,
      from: 0,
      trimBefore: null,
      parent: f?.id ?? null,
      displayName: P,
      documentationLink: d,
      muted: m,
      showInTimeline: !0,
      timelineOrder: null,
      startMediaFrom: h,
      mediaFrameAtSequenceZero: h * (1 - n),
      loopDisplay: c,
      playbackRate: n,
      sequencePlaybackRate: 1,
      getStack: b,
      premountDisplay: a,
      postmountDisplay: u,
      controls: null,
      effects: VP,
      refForOutline: E,
      isInsideSeries: !1,
      frozenFrame: null,
      frozenMediaFrame: null
    };
  }, [
    k,
    o,
    v,
    f?.id,
    e,
    t,
    h,
    n,
    b,
    a,
    u,
    c,
    d,
    P,
    E,
    m
  ]), I = y || w || typeof window < "u" && window.process?.env?.NODE_ENV === "test", L = H0({
    getSequence: I && s ? F : null,
    id: o
  });
  return { automaticOutlineRef: E, registration: L };
}, zP = (e, t, n, r) => {
  const [o, i] = l.useState(0), a = ae().isRendering, u = l.useCallback(() => {
    if (a)
      return {
        unblock: () => {
        }
      };
    let c = !1;
    return i((d) => d + 1), {
      unblock: () => {
        c || (c = !0, i((d) => d - 1));
      }
    };
  }, [a]);
  return l.useEffect(() => {
    a || o > 0 && !r() && (n(!0), Ge({
      logLevel: e,
      message: "Player is entering buffer state",
      mountTime: t,
      tag: "player"
    }));
  }, [o]), typeof window < "u" && l.useLayoutEffect(() => {
    a || o === 0 && r() && (n(!1), Ge({
      logLevel: e,
      message: "Player is exiting buffer state",
      mountTime: t,
      tag: "player"
    }));
  }, [o]), l.useMemo(() => ({ addBlock: u }), [u]);
}, Ds = D.createContext(null), V1 = ({ children: e }) => {
  const { logLevel: t, mountTime: n } = l.useContext(Br), { isBuffering: r, setBuffering: o } = l.useContext(Qt), i = zP(t ?? "info", n, o, r);
  return /* @__PURE__ */ S.jsx(Ds.Provider, {
    value: i,
    children: e
  });
}, Nl = () => {
  const e = l.useContext(Ds), t = Yt(), n = e ? e.addBlock : null;
  return l.useMemo(() => ({
    delayPlayback: () => {
      if (!n)
        throw new Error("Tried to enable the buffering state, but a Remotion context was not found. This API can only be called in a component that was passed to the Remotion Player or a <Composition>. Or you might have experienced a version mismatch - run `npx remotion versions` and ensure all packages have the same version. This error is thrown by the buffer state https://remotion.dev/docs/player/buffer-state");
      Te.trace({ logLevel: t, tag: "[buffer-state]" }, "Adding buffer handle", new Error().stack);
      const { unblock: r } = n();
      let o = !1;
      return {
        unblock: () => {
          o || (o = !0, Te.trace({ logLevel: t, tag: "[buffer-state]" }, "Removing buffer handle"), r());
        }
      };
    }
  }), [n, t]);
}, BP = () => /^((?!chrome|android).)*safari/i.test(window.navigator.userAgent), UP = ({
  mediaRef: e,
  mediaType: t,
  onVariableFpsVideoDetected: n,
  pauseWhenBuffering: r,
  logLevel: o,
  mountTime: i
}) => {
  const s = l.useRef(!1), { delayPlayback: a } = Nl(), u = l.useCallback((c) => {
    if (t !== "video" || !r)
      return;
    const d = e.current;
    if (!d)
      return;
    if (d.readyState >= d.HAVE_FUTURE_DATA && !BP()) {
      Ge({
        logLevel: o,
        message: `Not using buffer until first frame, because readyState is ${d.readyState} and is not Safari or Desktop Chrome`,
        mountTime: i,
        tag: "buffer"
      });
      return;
    }
    if (!d.requestVideoFrameCallback) {
      Ge({
        logLevel: o,
        message: "Not using buffer until first frame, because requestVideoFrameCallback is not supported",
        mountTime: i,
        tag: "buffer"
      });
      return;
    }
    s.current = !0, Ge({
      logLevel: o,
      message: `Buffering ${e.current?.src} until the first frame is received`,
      mountTime: i,
      tag: "buffer"
    });
    const m = a(), f = () => {
      m.unblock(), d.removeEventListener("ended", f, {
        once: !0
      }), d.removeEventListener("pause", f, {
        once: !0
      }), s.current = !1;
    }, v = () => {
      f();
    };
    d.requestVideoFrameCallback((h, w) => {
      Math.abs(w.mediaTime - c) > 0.5 && n(), f();
    }), d.addEventListener("ended", v, { once: !0 }), d.addEventListener("pause", v, { once: !0 }), d.addEventListener("canplay", v, {
      once: !0
    });
  }, [
    a,
    o,
    e,
    t,
    i,
    n,
    r
  ]);
  return l.useMemo(() => ({
    isBuffering: () => s.current,
    bufferUntilFirstFrame: u
  }), [u]);
}, WP = (e) => {
  const {
    duration: t,
    currentTime: n,
    paused: r,
    ended: o,
    desiredUnclampedTime: i,
    mediaTagTime: s,
    mediaTagLastUpdate: a,
    rvcTime: u,
    rvcLastUpdate: c,
    isVariableFpsVideo: d,
    acceptableTimeShift: m,
    lastSeekDueToShift: f,
    playing: v,
    playbackRate: h,
    mediaTagBufferingOrStalled: w,
    playerBuffering: x,
    absoluteFrame: g,
    onlyWarnForMediaSeekingError: p,
    isPremounting: y,
    isPostmounting: C,
    pauseWhenBuffering: b
  } = e, E = !Number.isNaN(t) && Number.isFinite(t) ? Math.min(t, i) : i, k = Math.abs(E - s), P = u ? Math.abs(E - u) : null, F = c && u > a ? P : k, I = P && !d ? F : k;
  if (I > m && f !== E)
    return {
      type: "seek-due-to-shift",
      shouldBeTime: E,
      why: `because time shift is too big. shouldBeTime = ${E}, isTime = ${s}, requestVideoCallbackTime = ${u}, timeShift = ${I}${d ? ", isVariableFpsVideo = true" : ""}, isPremounting = ${y}, isPostmounting = ${C}, pauseWhenBuffering = ${b}`,
      bufferUntilFirstFrame: v && h > 0,
      playReason: v && r ? "player is playing but media tag is paused, and just seeked" : null,
      warnAboutNonSeekable: !p
    };
  const L = v ? 0.15 : 0.01, _ = Math.abs(n - E) > L;
  if (!v || x && !w)
    return {
      type: "seek-if-not-playing",
      shouldBeTime: E,
      why: _ ? `not playing or something else is buffering. time offset is over seek threshold (${L})` : null
    };
  if (!v || x)
    return { type: "none" };
  const N = r && !o;
  if (N || g === 0) {
    const V = N ? "media tag is paused" : "absolute frame is 0";
    return {
      type: "play-and-seek",
      shouldBeTime: E,
      why: _ ? `is over timeshift threshold (threshold = ${L}) and ${V}` : null,
      playReason: `player is playing and ${V}`,
      bufferUntilFirstFrame: !d && h > 0
    };
  }
  return { type: "none" };
}, qP = (e) => {
  const t = D.useRef({
    time: e.current?.currentTime ?? 0,
    lastUpdate: performance.now()
  }), n = e.current?.currentTime ?? null;
  return n !== null && t.current.time !== n && (t.current.time = n, t.current.lastUpdate = performance.now()), t;
}, Qa = ({
  mediaRef: e,
  time: t,
  logLevel: n,
  why: r,
  mountTime: o
}) => {
  const i = Ml() ? Number(t.toFixed(1)) : t;
  return Ge({
    logLevel: n,
    tag: "seek",
    message: `Seeking from ${e.currentTime} to ${i}. src= ${e.src} Reason: ${r}`,
    mountTime: o
  }), e.currentTime = i, i;
}, HP = ({
  element: e,
  shouldBuffer: t,
  isPremounting: n,
  isPostmounting: r,
  logLevel: o,
  mountTime: i,
  src: s
}) => {
  const a = Nl(), [u, c] = l.useState(!1);
  return l.useEffect(() => {
    let d = [];
    const { current: m } = e;
    if (!m || !t)
      return;
    if (n || r) {
      if ((n || r) && m.readyState < m.HAVE_FUTURE_DATA && !navigator.userAgent.includes("Firefox/")) {
        Ge({
          logLevel: o,
          message: `Calling .load() on ${m.src} because readyState is ${m.readyState} and it is not Firefox. Element is premounted ${m.playbackRate}`,
          tag: "load",
          mountTime: i
        });
        const w = m.playbackRate;
        m.load(), m.playbackRate = w;
      }
      return;
    }
    const f = (w) => {
      let x = !1;
      d.forEach((g) => {
        g(w), x = !0;
      }), d = [], c((g) => (g && (x = !0), !1)), x && Ge({
        logLevel: o,
        message: `Unmarking as buffering: ${m.src}. Reason: ${w}`,
        tag: "buffer",
        mountTime: i
      });
    }, v = (w) => {
      c(!0), Ge({
        logLevel: o,
        message: `Marking as buffering: ${m.src}. Reason: ${w}`,
        tag: "buffer",
        mountTime: i
      });
      const { unblock: x } = a.delayPlayback(), g = () => {
        f('"canplay" was fired'), h();
      }, p = () => {
        f('"error" event was occurred'), h();
      };
      m.addEventListener("canplay", g, {
        once: !0
      }), d.push(() => {
        m.removeEventListener("canplay", g);
      }), m.addEventListener("error", p, {
        once: !0
      }), d.push(() => {
        m.removeEventListener("error", p);
      }), d.push((y) => {
        Ge({
          logLevel: o,
          message: `Unblocking ${m.src} from buffer. Reason: ${y}`,
          tag: "buffer",
          mountTime: i
        }), x();
      });
    }, h = () => {
      if (m.readyState < m.HAVE_FUTURE_DATA) {
        if (v(`readyState is ${m.readyState}, which is less than HAVE_FUTURE_DATA`), !navigator.userAgent.includes("Firefox/")) {
          Ge({
            logLevel: o,
            message: `Calling .load() on ${s} because readyState is ${m.readyState} and it is not Firefox. ${m.playbackRate}`,
            tag: "load",
            mountTime: i
          });
          const w = m.playbackRate;
          m.load(), m.playbackRate = w;
        }
      } else {
        const w = () => {
          v('"waiting" event was fired');
        };
        m.addEventListener("waiting", w), d.push(() => {
          m.removeEventListener("waiting", w);
        });
      }
    };
    return h(), () => {
      f("element was unmounted or prop changed");
    };
  }, [
    a,
    s,
    e,
    n,
    r,
    o,
    t,
    i
  ]), u;
}, KP = ({
  mediaRef: e,
  mediaType: t,
  lastSeek: n,
  onVariableFpsVideoDetected: r
}) => {
  const o = l.useRef(null);
  return l.useEffect(() => {
    const { current: i } = e;
    if (i)
      o.current = {
        time: i.currentTime,
        lastUpdate: performance.now()
      };
    else {
      o.current = null;
      return;
    }
    if (t !== "video") {
      o.current = null;
      return;
    }
    const s = i;
    if (!s.requestVideoFrameCallback)
      return;
    let a = () => {
    };
    const u = () => {
      if (!s)
        return;
      const c = s.requestVideoFrameCallback((d, m) => {
        if (o.current !== null) {
          const f = Math.abs(o.current.time - m.mediaTime), v = Math.abs(n.current === null ? 1 / 0 : m.mediaTime - n.current);
          f > 0.5 && v > 0.5 && m.mediaTime > o.current.time && r();
        }
        o.current = {
          time: m.mediaTime,
          lastUpdate: performance.now()
        }, u();
      });
      a = () => {
        s.cancelVideoFrameCallback(c), a = () => {
        };
      };
    };
    return u(), () => {
      a();
    };
  }, [n, e, t, r]), o;
}, z1 = ({
  frame: e,
  playbackRate: t,
  startFrom: n
}) => Kr(e, [-1, n, n + 1], [-1, n, n + t]), B1 = ({
  fps: e,
  frame: t,
  playbackRate: n,
  startFrom: r
}) => {
  const o = z1({
    frame: t,
    playbackRate: n,
    startFrom: r
  }), i = 1e3 / e;
  return o * i / 1e3;
}, Ov = {}, GP = (e, t) => {
  if (e === null || e.seekable.length === 0 || e.seekable.length > 1 || Ov[e.src])
    return;
  const n = { start: e.seekable.start(0), end: e.seekable.end(0) };
  if (n.start === 0 && n.end === 0) {
    const r = [
      `The media ${e.src} cannot be seeked. This could be one of few reasons:`,
      "1) The media resource was replaced while the video is playing but it was not loaded yet.",
      "2) The media does not support seeking.",
      "3) The media was loaded with security headers prventing it from being included.",
      "Please see https://remotion.dev/docs/non-seekable-media for assistance."
    ].join(`
`);
    console.error(r), Ov[e.src] = !0;
  }
}, jv = 0.65, YP = ({
  reason: e,
  isPremounting: t,
  isPostmounting: n
}) => e === "buffering" ? "player is buffering but media tag is not" : t ? "media is premounting" : n ? "media is postmounting" : "Player is not playing", U1 = ({
  mediaRef: e,
  src: t,
  mediaType: n,
  playbackRate: r,
  preservePitch: o = !0,
  onlyWarnForMediaSeekingError: i,
  acceptableTimeshift: s,
  pauseWhenBuffering: a,
  isPremounting: u,
  isPostmounting: c,
  onAutoPlayError: d
}) => {
  const { playbackRate: m } = Fm(), f = hn(), v = Hr(), h = Pm(), w = Im(), { fps: x } = bt(), g = l.useContext(hr), p = l.useRef(null), y = l.useRef(null), C = Yt(), b = ks(), E = l.useRef({}), k = l.useCallback(() => {
    t && (E.current[t] || (Te.verbose({ logLevel: C, tag: null }, `Detected ${t} as a variable FPS video. Disabling buffering while seeking.`), E.current[t] = !0));
  }, [C, t]), P = KP({
    mediaRef: e,
    mediaType: n,
    lastSeek: y,
    onVariableFpsVideoDetected: k
  }), F = qP(e), I = B1({
    frame: f,
    playbackRate: r,
    startFrom: g,
    fps: x
  }), L = HP({
    element: e,
    shouldBuffer: a,
    isPremounting: u,
    isPostmounting: c,
    logLevel: C,
    mountTime: b,
    src: t ?? null
  }), { bufferUntilFirstFrame: _, isBuffering: O } = UP({
    mediaRef: e,
    mediaType: n,
    onVariableFpsVideoDetected: k,
    pauseWhenBuffering: a,
    logLevel: C,
    mountTime: b
  }), N = l.useContext(ge), j = r * m * (N?.playbackRate ?? 1), V = e.current?.duration ? Math.min(e.current.duration, s ?? jv) : s ?? jv, B = ae();
  l.useLayoutEffect(() => {
    const A = Math.max(0, j);
    e.current && e.current.defaultPlaybackRate !== A && (e.current.defaultPlaybackRate = A), e.current && e.current.playbackRate !== A && (e.current.playbackRate = A), e.current && e.current.preservesPitch !== o && (e.current.preservesPitch = o);
  }, [e, j, o]), l.useEffect(() => {
    const A = n === "audio" ? "<Html5Audio>" : "<Html5Video>";
    if (!e.current)
      throw new Error(`No ${n} ref found`);
    if (!t)
      throw new Error(`No 'src' attribute was passed to the ${A} element.`);
    const { current: T } = e, M = L || O();
    let R = null;
    h ? w && !M && (R = "buffering") : R = "not-playing", !T.paused && R !== null && (Ge({
      logLevel: C,
      tag: "pause",
      message: `Pausing ${T.src} because ${YP({
        reason: R,
        isPremounting: u,
        isPostmounting: c
      })}`,
      mountTime: b
    }), T.pause());
    const $ = WP({
      duration: T.duration,
      currentTime: T.currentTime,
      paused: T.paused,
      ended: T.ended,
      desiredUnclampedTime: I,
      mediaTagTime: F.current.time,
      mediaTagLastUpdate: F.current.lastUpdate,
      rvcTime: P.current?.time ?? null,
      rvcLastUpdate: P.current?.lastUpdate ?? null,
      isVariableFpsVideo: !!E.current[t],
      acceptableTimeShift: V,
      lastSeekDueToShift: p.current,
      playing: h,
      playbackRate: j,
      mediaTagBufferingOrStalled: M,
      playerBuffering: w,
      absoluteFrame: v,
      onlyWarnForMediaSeekingError: i,
      isPremounting: u,
      isPostmounting: c,
      pauseWhenBuffering: a
    });
    if ($.type !== "none") {
      if ($.type === "seek-due-to-shift") {
        y.current = Qa({
          mediaRef: T,
          time: $.shouldBeTime,
          logLevel: C,
          why: $.why,
          mountTime: b
        }), p.current = y.current, $.bufferUntilFirstFrame && _($.shouldBeTime), $.playReason !== null && Fu({
          mediaRef: e,
          mediaType: n,
          onAutoPlayError: d,
          logLevel: C,
          mountTime: b,
          reason: $.playReason,
          isPlayer: B.isPlayer
        }), $.warnAboutNonSeekable && GP(T);
        return;
      }
      if ($.type === "seek-if-not-playing") {
        $.why !== null && (y.current = Qa({
          mediaRef: T,
          time: $.shouldBeTime,
          logLevel: C,
          why: $.why,
          mountTime: b
        }));
        return;
      }
      $.why !== null && (y.current = Qa({
        mediaRef: T,
        time: $.shouldBeTime,
        logLevel: C,
        why: $.why,
        mountTime: b
      })), Fu({
        mediaRef: e,
        mediaType: n,
        onAutoPlayError: d,
        logLevel: C,
        mountTime: b,
        reason: $.playReason,
        isPlayer: B.isPlayer
      }), $.bufferUntilFirstFrame && _($.shouldBeTime);
    }
  }, [
    v,
    V,
    _,
    P,
    C,
    I,
    O,
    L,
    e,
    n,
    i,
    j,
    w,
    h,
    t,
    d,
    u,
    c,
    a,
    b,
    F,
    B.isPlayer
  ]);
}, W1 = ({
  mediaRef: e,
  id: t,
  mediaType: n,
  onAutoPlayError: r,
  isPremounting: o,
  isPostmounting: i
}) => {
  const { audioAndVideoTags: s, isPlaying: a } = qr(), { subscribePlaying: u } = l.useContext(Qt), c = l.useRef(a);
  c.current = a;
  const d = Yt(), m = ks(), f = ae();
  l.useEffect(() => {
    const v = {
      id: t,
      play: (w) => {
        if (c.current() && !(o || i))
          return Fu({
            mediaRef: e,
            mediaType: n,
            onAutoPlayError: r,
            logLevel: d,
            mountTime: m,
            reason: w,
            isPlayer: f.isPlayer
          });
      }
    };
    s.current.push(v);
    const h = u((w) => {
      if (w.playing)
        return;
      const x = e.current;
      !x || x.paused || (Ge({
        logLevel: d,
        tag: "pause",
        message: `Pausing ${x.src} because Player is not playing`,
        mountTime: m
      }), x.pause());
    });
    return () => {
      h(), s.current = s.current.filter((w) => w.id !== t);
    };
  }, [
    s,
    t,
    e,
    n,
    r,
    o,
    i,
    d,
    m,
    f.isPlayer,
    u
  ]);
}, up = l.createContext({
  playerMuted: !1,
  mediaVolume: 1
}), lp = l.createContext({
  setPlayerMuted: () => {
    throw new Error("default");
  },
  setMediaVolume: () => {
    throw new Error("default");
  }
}), cp = () => {
  const { mediaVolume: e } = l.useContext(up), { setMediaVolume: t } = l.useContext(lp);
  return l.useMemo(() => [e, t], [e, t]);
}, q1 = () => {
  const { playerMuted: e } = l.useContext(up), { setPlayerMuted: t } = l.useContext(lp);
  return l.useMemo(() => [e, t], [e, t]);
}, ni = ({
  frame: e,
  volume: t,
  mediaVolume: n = 1
}) => {
  if (typeof t == "number")
    return t * n;
  if (typeof t > "u")
    return Number(n);
  const r = t(e) * n;
  if (typeof r != "number")
    throw new TypeError(`You passed in a a function to the volume prop but it did not return a number but a value of type ${typeof r} for frame ${e}`);
  if (Number.isNaN(r))
    throw new TypeError(`You passed in a function to the volume prop but it returned NaN for frame ${e}.`);
  if (!Number.isFinite(r))
    throw new TypeError(`You passed in a function to the volume prop but it returned a non-finite number for frame ${e}.`);
  return Math.max(0, r);
}, ri = (e) => {
  if (e >= 100)
    throw new Error(`Volume was set to ${e}, but regular volume is 1, not 100. Did you forget to divide by 100? Set a volume of less than 100 to dismiss this error.`);
}, QP = ({
  muted: e,
  playerMuted: t,
  volume: n,
  isInsideFreeze: r,
  audioEnabled: o
}) => {
  const i = e || r, s = i || t || n !== null && n <= 0;
  return {
    isMutedForTimeline: i,
    isMutedForPlayback: s,
    shouldUseAudio: o && !s
  };
}, oi = ({
  muted: e,
  volume: t,
  audioEnabled: n
}) => {
  const [r] = q1(), o = Nm();
  return QP({
    muted: e,
    playerMuted: r,
    volume: t,
    isInsideFreeze: o,
    audioEnabled: n
  });
}, JP = (e, t) => {
  const [n] = l.useState(e.shouldPreMountAudioTags);
  if (e.shouldPreMountAudioTags !== n)
    throw new Error("Cannot change the behavior for pre-mounting audio tags dynamically.");
  const r = Yt(), {
    timelineId: o,
    userPreferredVolume: i,
    isMutedForPlayback: s,
    volume: a,
    muted: u,
    playbackRate: c,
    preservePitch: d,
    shouldPreMountAudioTags: m,
    src: f,
    onDuration: v,
    acceptableTimeShiftInSeconds: h,
    _remotionInternalNeedsDurationCalculation: w,
    _remotionInternalNativeLoopPassed: x,
    _remotionInternalStack: g,
    allowAmplificationDuringRender: p,
    name: y,
    pauseWhenBuffering: C,
    showInTimeline: b,
    loopVolumeCurveBehavior: E,
    crossOrigin: k,
    delayRenderRetries: P,
    delayRenderTimeoutInMilliseconds: F,
    toneFrequency: I,
    useWebAudioApi: L,
    onError: _,
    onNativeError: O,
    audioStreamIndex: N,
    ...j
  } = e;
  if (!f)
    throw new TypeError("No 'src' was passed to <Html5Audio>.");
  const V = Yr(f), B = l.useContext(ge);
  ri(i);
  const A = rp({
    crossOrigin: k,
    requestsVideoFrame: !1,
    isClientSideRendering: !1
  }), T = l.useMemo(() => ({
    muted: s,
    src: V,
    loop: x,
    crossOrigin: A,
    ...j
  }), [
    x,
    s,
    j,
    V,
    A
  ]), M = l.useMemo(() => `audio-${js(f ?? "")}-${B?.relativeFrom}-${B?.cumulatedFrom}-${B?.durationInFrames}-muted:${e.muted}-loop:${e.loop}`, [
    f,
    B?.relativeFrom,
    B?.cumulatedFrom,
    B?.durationInFrames,
    e.muted,
    e.loop
  ]), {
    el: R,
    mediaElementSourceNode: $,
    cleanupOnMediaTagUnmount: z
  } = MP({
    aud: T,
    audioId: M,
    premounting: !!B?.premounting,
    postmounting: !!B?.postmounting
  });
  return U1({
    mediaRef: R,
    src: f,
    mediaType: "audio",
    playbackRate: c ?? 1,
    preservePitch: d,
    onlyWarnForMediaSeekingError: !1,
    acceptableTimeshift: h ?? null,
    isPremounting: !!B?.premounting,
    isPostmounting: !!B?.postmounting,
    pauseWhenBuffering: C,
    onAutoPlayError: null
  }), W1({
    id: o,
    isPostmounting: !!B?.postmounting,
    isPremounting: !!B?.premounting,
    mediaRef: R,
    mediaType: "audio",
    onAutoPlayError: null
  }), L1({
    logLevel: r,
    mediaRef: R,
    source: $,
    volume: i,
    shouldUseWebAudioApi: L ?? !1
  }), (D.useInsertionEffect ?? D.useLayoutEffect)(() => j1.bind(null, z), [z]), l.useImperativeHandle(t, () => R.current, [R]), O1(R, v, f, !0), n ? null : /* @__PURE__ */ S.jsx("audio", {
    ref: R,
    preload: "metadata",
    crossOrigin: A,
    ...T
  });
}, ZP = l.forwardRef(JP), XP = (e, t) => {
  const {
    volume: n,
    muted: r,
    playbackRate: o,
    src: i,
    name: s,
    _remotionInternalStack: a,
    showInTimeline: u,
    loopVolumeCurveBehavior: c
  } = e, [d] = l.useState(() => String(Math.random())), m = l.useContext(ge), { isStudio: f } = ae(), [v] = cp(), h = ti(c ?? "repeat"), w = ni({
    frame: h,
    volume: n,
    mediaVolume: v
  }), { isMutedForTimeline: x, isMutedForPlayback: g } = oi({
    muted: r ?? !1,
    volume: w,
    audioEnabled: !0
  }), p = l.useCallback(() => a ?? null, [a]), { registration: y } = ap({
    src: i,
    mediaType: "audio",
    playbackRate: o ?? 1,
    displayName: s ?? null,
    id: d,
    getStack: p,
    showInTimeline: u,
    premountDisplay: m?.premountDisplay ?? null,
    postmountDisplay: m?.postmountDisplay ?? null,
    loopDisplay: void 0,
    documentationLink: "https://www.remotion.dev/docs/html5-audio",
    muted: x
  }), C = l.useMemo(() => f || y !== null ? {
    type: "sequence",
    id: d,
    value: y,
    outlineChildrenRef: null
  } : null, [f, y, d]);
  return /* @__PURE__ */ S.jsx(Qu, {
    value: null,
    _remotionCommitMetadata: C,
    children: /* @__PURE__ */ S.jsx(Wr, {
      children: /* @__PURE__ */ S.jsx(ZP, {
        ...e,
        ref: t,
        timelineId: d,
        userPreferredVolume: w,
        isMutedForPlayback: g
      })
    })
  });
}, H1 = l.forwardRef(XP), dp = l.createContext(null), eI = () => {
  const e = l.useContext(dp);
  return !e || e.videoEnabled === null ? window.remotion_videoEnabled : e.videoEnabled;
}, $l = () => {
  const e = l.useContext(dp);
  return !e || e.audioEnabled === null ? window.remotion_audioEnabled : e.audioEnabled;
}, tI = ({
  children: e,
  videoEnabled: t,
  audioEnabled: n
}) => {
  const r = l.useMemo(() => ({ videoEnabled: t, audioEnabled: n }), [t, n]);
  return /* @__PURE__ */ S.jsx(dp.Provider, {
    value: r,
    children: e
  });
}, nI = (e, t) => {
  const n = l.useRef(null), {
    registerRenderAsset: r,
    unregisterRenderAsset: o,
    volume: i,
    playbackRate: s,
    allowAmplificationDuringRender: a,
    onDuration: u,
    toneFrequency: c,
    _remotionInternalNeedsDurationCalculation: d,
    _remotionInternalNativeLoopPassed: m,
    acceptableTimeShiftInSeconds: f,
    name: v,
    onNativeError: h,
    delayRenderRetries: w,
    delayRenderTimeoutInMilliseconds: x,
    loopVolumeCurveBehavior: g,
    pauseWhenBuffering: p,
    audioStreamIndex: y,
    preservePitch: C,
    ...b
  } = e, E = Hr(), k = ti(g ?? "repeat"), P = hn(), F = l.useContext(ge), I = F?.playbackRate ?? 1, L = l.useContext(hr), { delayRender: _, continueRender: O } = _t(), N = l.useMemo(() => `audio-${js(e.src ?? "")}-${F?.relativeFrom}-${F?.cumulatedFrom}-${F?.durationInFrames}`, [
    e.src,
    F?.relativeFrom,
    F?.cumulatedFrom,
    F?.durationInFrames
  ]), j = ni({
    volume: i,
    frame: k,
    mediaVolume: 1
  });
  ri(j);
  const V = $l(), { shouldUseAudio: B } = oi({
    muted: e.muted ?? !1,
    volume: j,
    audioEnabled: V
  });
  l.useImperativeHandle(t, () => n.current, []), l.useEffect(() => {
    if (!e.src)
      throw new Error("No src passed");
    if (B)
      return r({
        type: "audio",
        src: pn(e.src),
        id: N,
        frame: E,
        volume: j,
        mediaFrame: L + (P - L) / I,
        playbackRate: (e.playbackRate ?? 1) * I,
        toneFrequency: c ?? 1,
        audioStartFrame: L,
        audioStreamIndex: y ?? 0,
        preservePitch: C ?? !0
      }), () => o(N);
  }, [
    B,
    e.src,
    r,
    E,
    N,
    o,
    j,
    k,
    P,
    s,
    e.playbackRate,
    c,
    L,
    I,
    y,
    C
  ]);
  const { src: A } = e, T = t || d;
  return l.useLayoutEffect(() => {
    if (window.process?.env?.NODE_ENV === "test" || !T)
      return;
    const M = _("Loading <Html5Audio> duration with src=" + A, {
      retries: w ?? void 0,
      timeoutInMilliseconds: x ?? void 0
    }), { current: R } = n, $ = () => {
      R?.duration && u(R.src, R.duration), O(M);
    };
    return R?.duration ? (u(R.src, R.duration), O(M)) : R?.addEventListener("loadedmetadata", $, { once: !0 }), () => {
      R?.removeEventListener("loadedmetadata", $), O(M);
    };
  }, [
    A,
    u,
    T,
    w,
    x,
    O,
    _
  ]), T ? /* @__PURE__ */ S.jsx("audio", {
    ref: n,
    ...b,
    onError: h
  }) : null;
}, rI = D.memo(l.forwardRef(nI)), oI = l.forwardRef((e, t) => {
  const { registerRenderAsset: n, unregisterRenderAsset: r } = l.useContext(Gr);
  return /* @__PURE__ */ S.jsx(rI, {
    ...e,
    ref: t,
    registerRenderAsset: n,
    unregisterRenderAsset: r
  });
}), iI = (e, t) => {
  const n = l.useContext(Fl), r = e, {
    startFrom: o,
    endAt: i,
    trimBefore: s,
    trimAfter: a,
    durationInFrames: u,
    name: c,
    _remotionInternalStack: d,
    pauseWhenBuffering: m,
    showInTimeline: f,
    onError: v,
    freeze: h,
    ...w
  } = r, { loop: x, freeze: g, ...p } = r, { fps: y } = bt(), C = ae(), b = Ps(m);
  if (C.isClientSideRendering)
    throw new Error("<Html5Audio> is not supported in @remotion/web-renderer. Use <Audio> from @remotion/media instead. See https://remotion.dev/docs/client-side-rendering/limitations");
  if (typeof h < "u")
    throw new TypeError('The "freeze" prop is not supported on <Html5Audio />. Use <Sequence freeze={...}> to freeze media playback.');
  const { durations: E, setDurations: k } = l.useContext(np);
  if (typeof e.src != "string")
    throw new TypeError(`The \`<Html5Audio>\` tag requires a string for \`src\`, but got ${JSON.stringify(e.src)} instead.`);
  const P = Yr(e.src), F = l.useCallback((V) => {
    console.log(V.currentTarget.error);
    const B = `Could not play audio with src ${P}: ${V.currentTarget.error}. See https://remotion.dev/docs/media-playback-error for help.`;
    if (x) {
      if (v) {
        v(new Error(B));
        return;
      }
      hE(new Error(B));
    } else
      v?.(new Error(B)), console.warn(B);
  }, [x, v, P]), I = l.useMemo(() => M1.bind(null, k), [k]), L = E[pn(P)] ?? E[pn(e.src)];
  Tl({ startFrom: o, endAt: i, trimBefore: s, trimAfter: a }), u !== void 0 && Vr(u, {
    component: "of the <Html5Audio /> component",
    allowFloats: !0
  });
  const { trimBeforeValue: _, trimAfterValue: O } = Rl({
    startFrom: o,
    endAt: i,
    trimBefore: s,
    trimAfter: a
  }), N = tp({
    durationInFrames: u,
    trimAfter: O,
    trimBefore: _
  }), j = N ?? (L === void 0 ? void 0 : L * y);
  return x && j !== void 0 ? Number.isFinite(j) ? /* @__PURE__ */ S.jsx(kl, {
    layout: "none",
    durationInFrames: El({
      trimAfter: N,
      mediaDurationInFrames: j,
      playbackRate: e.playbackRate ?? 1,
      trimBefore: _
    }),
    children: /* @__PURE__ */ S.jsx(Ja, {
      ...p,
      ref: t,
      _remotionInternalNativeLoopPassed: !0
    })
  }) : /* @__PURE__ */ S.jsx(Ja, {
    ...p,
    ref: t,
    _remotionInternalNativeLoopPassed: !0
  }) : typeof _ < "u" || typeof N < "u" ? /* @__PURE__ */ S.jsx(hr.Provider, {
    value: _ ?? 0,
    children: /* @__PURE__ */ S.jsx(mt, {
      layout: "none",
      from: 0 - (_ ?? 0),
      showInTimeline: !1,
      durationInFrames: N === void 0 ? void 0 : (_ ?? 0) + (N - (_ ?? 0)) / (e.playbackRate ?? 1),
      name: c,
      children: /* @__PURE__ */ S.jsx(Ja, {
        _remotionInternalNeedsDurationCalculation: !!x,
        pauseWhenBuffering: b,
        ...w,
        ref: t
      })
    })
  }) : (Il({
    playbackRate: e.playbackRate,
    preservePitch: e.preservePitch,
    volume: e.volume
  }, "Html5Audio"), C.isRendering ? /* @__PURE__ */ S.jsx(oI, {
    onDuration: I,
    ...e,
    ref: t,
    onNativeError: F,
    _remotionInternalNeedsDurationCalculation: !!x
  }) : /* @__PURE__ */ S.jsx(H1, {
    _remotionInternalNativeLoopPassed: e._remotionInternalNativeLoopPassed ?? !1,
    _remotionInternalStack: d ?? null,
    shouldPreMountAudioTags: n !== null && n.numberOfAudioTags > 0,
    ...e,
    ref: t,
    onNativeError: F,
    onDuration: I,
    pauseWhenBuffering: b,
    _remotionInternalNeedsDurationCalculation: !!x,
    showInTimeline: f ?? !0
  }));
}, Ja = l.forwardRef(iI);
Le(Ja);
var sI = (e) => {
  if (e === void 0)
    return 1;
  if (typeof e != "number" || !Number.isFinite(e) || e <= 0)
    throw new Error(`<Solid>: \`pixelDensity\` must be a positive finite number. Received: ${String(e)}.`);
  return e;
}, aI = {
  ...jn,
  ...Jt,
  color: {
    type: "color",
    default: "transparent",
    description: "Color"
  },
  width: {
    type: "number",
    min: 1,
    step: 1,
    default: 1920,
    description: "Width",
    hiddenFromList: !1
  },
  height: {
    type: "number",
    min: 1,
    step: 1,
    default: 1080,
    description: "Height",
    hiddenFromList: !1
  },
  pixelDensity: {
    type: "number",
    min: 1,
    max: 3,
    step: 0.1,
    default: 1,
    description: "Pixel density",
    hiddenFromList: !1
  },
  ...At,
  ...Ln,
  ..._n,
  ...An,
  ...On
}, uI = ({
  color: e,
  width: t,
  height: n,
  effects: r = [],
  effectsOutputSize: o = null,
  className: i,
  style: s,
  pixelDensity: a,
  overrideId: u,
  videoConfigValues: c,
  reference: d
}) => {
  const { delayRender: m, continueRender: f, cancelRender: v } = _t(), h = sI(a), w = Math.ceil(t * h), x = Math.ceil(n * h), [g, p] = l.useState(null), y = As({
    effects: r,
    overrideId: u ?? null,
    videoConfigValues: c
  }), C = l.useMemo(() => {
    if (typeof document > "u")
      return null;
    const P = document.createElement("canvas");
    return P.width = 1, P.height = 1, P;
  }, []), b = Os(o), E = l.useCallback((P) => {
    p(P), typeof d == "function" ? d(P) : d && (d.current = P);
  }, [d]);
  l.useEffect(() => {
    if (!g || !C)
      return;
    const P = m("Solid effect chain");
    if (!b)
      return f(P), () => {
        f(P);
      };
    const F = C.getContext("2d", { colorSpace: "srgb" });
    if (!F) {
      v(new Error("Failed to acquire 2D context for <Solid> source"));
      return;
    }
    return F.clearRect(0, 0, 1, 1), e !== void 0 && (F.fillStyle = e, F.fillRect(0, 0, 1, 1)), Ls({
      state: b.get(w, x),
      source: C,
      effects: y,
      output: g,
      width: w,
      height: x
    }).then((I) => {
      I && f(P);
    }).catch((I) => {
      v(I);
    }), () => {
      f(P);
    };
  }, [
    e,
    g,
    C,
    b,
    w,
    x,
    m,
    f,
    v,
    y
  ]);
  const k = l.useMemo(() => ({
    width: t,
    height: n,
    ...s ?? {}
  }), [n, s, t]);
  return /* @__PURE__ */ S.jsx("canvas", {
    ref: E,
    width: w,
    height: x,
    className: i,
    style: k
  });
}, lI = l.forwardRef(({
  effects: e = [],
  effectsOutputSize: t = null,
  controls: n,
  color: r,
  height: o,
  width: i,
  className: s,
  durationInFrames: a,
  style: u,
  name: c,
  from: d,
  premountFor: m,
  postmountFor: f,
  styleWhilePremounted: v,
  styleWhilePostmounted: h,
  trimBefore: w,
  playbackRate: x,
  loop: g,
  freeze: p,
  hidden: y,
  showInTimeline: C,
  pixelDensity: b,
  cropLeft: E,
  cropRight: k,
  cropTop: P,
  cropBottom: F,
  ...I
}, L) => {
  const _ = _s(e), O = l.useRef(null);
  l.useImperativeHandle(L, () => O.current, []);
  const {
    effectivePremountFor: N,
    effectivePostmountFor: j,
    freezeFrame: V,
    isPremountingOrPostmounting: B,
    premountingActive: A,
    postmountingActive: T,
    premountingStyle: M
  } = gn({
    from: d ?? 0,
    durationInFrames: Zt({
      durationInFrames: a,
      playbackRate: x,
      loop: g
    }),
    premountFor: m ?? null,
    postmountFor: f ?? null,
    style: u ?? null,
    styleWhilePremounted: v ?? null,
    styleWhilePostmounted: h ?? null,
    hideWhilePremounted: "opacity"
  }), R = pr({
    cropLeft: E,
    cropRight: k,
    cropTop: P,
    cropBottom: F,
    style: M,
    componentName: "<Solid />"
  });
  return /* @__PURE__ */ S.jsx(vn, {
    frame: V,
    active: B,
    _remotionInternalIsPremounting: A,
    children: /* @__PURE__ */ S.jsx(mt, {
      layout: "none",
      from: d,
      trimBefore: w,
      playbackRate: x,
      loop: g,
      freeze: p,
      hidden: y,
      showInTimeline: C,
      controls: n,
      _remotionInternalEffects: _,
      durationInFrames: a,
      name: c ?? "<Solid>",
      _remotionInternalDocumentationLink: "https://www.remotion.dev/docs/solid",
      ...I,
      _remotionInternalPremountDisplay: N || null,
      _remotionInternalPostmountDisplay: j || null,
      _remotionInternalIsPremounting: A,
      _remotionInternalIsPostmounting: T,
      children: /* @__PURE__ */ S.jsx(Wr, {
        children: /* @__PURE__ */ S.jsx(uI, {
          reference: O,
          videoConfigValues: n?.videoConfigValues ?? null,
          overrideId: n?.overrideId ?? null,
          color: r,
          height: o,
          width: i,
          className: s,
          style: R ?? void 0,
          effects: e,
          effectsOutputSize: t,
          pixelDensity: b
        })
      })
    })
  });
}), K1 = $t({
  Component: lI,
  componentName: "<Solid>",
  componentIdentity: "dev.remotion.remotion.Solid",
  schema: aI,
  supportsEffects: !0
});
K1.displayName = "Solid";
Le(K1);
var G1 = ({ children: e, style: t, label: n }) => {
  const r = r0({ dontThrowIfOutsideOfRemotion: !0 }), o = r > 0 ? r : 1;
  return /* @__PURE__ */ S.jsxs("div", {
    style: { position: "relative", ...t },
    children: [
      e,
      /* @__PURE__ */ S.jsxs("div", {
        className: "css-reset",
        style: {
          position: "absolute",
          top: 8 / o,
          right: 8 / o,
          zIndex: 1e3,
          transform: `scale(${1 / o})`,
          transformOrigin: "top right",
          maxWidth: `calc(${o * 100}% - 16px)`,
          padding: "8px 10px",
          borderRadius: 6,
          border: "1px solid #7f3540",
          backgroundColor: "#2b171c",
          boxShadow: "0 2px 8px #0003",
          pointerEvents: "none",
          textAlign: "left"
        },
        children: [
          /* @__PURE__ */ S.jsx("div", {
            style: {
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1.5,
              color: "#ffabb5"
            },
            children: "HTML-in-canvas is not available"
          }),
          /* @__PURE__ */ S.jsx("div", {
            style: {
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: 11,
              fontWeight: 400,
              lineHeight: 1.5,
              color: "#e8bdc3"
            },
            children: n
          })
        ]
      })
    ]
  });
}, Dv = /* @__PURE__ */ new WeakMap(), cI = (e) => {
  const t = Dv.get(e);
  if (t)
    return t;
  const n = e.transferControlToOffscreen();
  return Dv.set(e, n), n;
}, Sa = null, _l = () => {
  if (Sa !== null)
    return Sa;
  if (typeof document > "u")
    return !1;
  const e = document.createElement("canvas");
  return Sa = typeof e.getContext("2d")?.drawElementImage == "function" && typeof e.requestPaint == "function" && typeof e.captureElementImage == "function" && "transferControlToOffscreen" in HTMLCanvasElement.prototype, Sa;
}, fp = 157, mp = () => {
  if (!_l() || typeof navigator > "u")
    return !1;
  const e = navigator.userAgent.match(/(?:Chrome|Chromium)\/(\d+)/)?.[1];
  return e !== void 0 && Number(e) >= fp;
}, dI = "HTML in Canvas requires Chrome 149 or newer with Canvas Draw Element enabled at chrome://flags/#canvas-draw-element.", Y1 = () => {
  if (typeof document > "u")
    return `HTML in Canvas is unavailable because there is no browser document. ${dI}`;
  const e = typeof navigator > "u" ? "" : navigator.userAgent, t = e.match(/(?:Chrome|Chromium)\/(\d+)/)?.[1];
  let n = "this browser";
  return e.includes("Edg/") ? n = "Microsoft Edge" : e.includes("Chromium/") ? n = "Chromium" : t ? n = "Chrome" : e.includes("Firefox/") ? n = "Firefox" : e.includes("Safari/") && (n = "Safari"), t && Number(t) >= 149 ? `HTML in Canvas is unavailable. Enable Canvas Draw Element at ${n === "Microsoft Edge" ? "edge://flags/#canvas-draw-element" : "chrome://flags/#canvas-draw-element"} and fully restart ${n}.` : t ? `HTML in Canvas is not supported in ${n} ${t}. Use a Chromium-based browser running version 149 or newer.` : `HTML in Canvas is not supported in ${n}. Use Chrome 149 or newer.`;
};
function Q1(e, t) {
  if (typeof e != "number" || typeof t != "number")
    throw new Error(`HtmlInCanvas: \`width\` and \`height\` must be numbers. Received width=${String(e)}, height=${String(t)}.`);
  if (!Number.isInteger(e) || e <= 0)
    throw new Error(`HtmlInCanvas: \`width\` must be a positive integer. Received: ${String(e)}.`);
  if (!Number.isInteger(t) || t <= 0)
    throw new Error(`HtmlInCanvas: \`height\` must be a positive integer. Received: ${String(t)}.`);
}
function J1(e) {
  if (e === void 0)
    return 1;
  if (typeof e != "number" || !Number.isFinite(e) || e <= 0)
    throw new Error(`HtmlInCanvas: \`pixelDensity\` must be a positive finite number. Received: ${String(e)}.`);
  return e;
}
var xa = (e) => e instanceof DOMException && e.name === "InvalidStateError", Vv = "HtmlInCanvas: Expected the element to be inside the viewport during rendering, but Chrome had no cached paint record for it.", Ca = ({
  target: e,
  width: t,
  height: n
}) => {
  e.width !== t && (e.width = t), e.height !== n && (e.height = n);
}, zv = ({
  canvas: e,
  elementImage: t
}) => {
  const n = e.getContext("2d");
  if (!n)
    throw new Error("Failed to acquire 2D context for <HtmlInCanvas> canvas");
  n.reset(), n.drawElementImage(t, 0, 0);
}, af = l.createContext(null), Z1 = () => {
  const e = l.useContext(af);
  return _l() ? e && !mp() ? `Nested <HtmlInCanvas> components require Chrome ${fp} or newer with HTML-in-canvas enabled.` : null : Y1();
}, pp = l.forwardRef(({
  width: e,
  height: t,
  effects: n,
  effectsOutputSize: r,
  children: o,
  canvasSiblings: i,
  onPaint: s,
  onInit: a,
  pixelDensity: u,
  controls: c,
  style: d,
  renderFrame: m
}, f) => {
  const v = l.useContext(af);
  if (Q1(e, t), v && !mp())
    throw new Error(`Nested <HtmlInCanvas> components require Chrome ${fp} or newer with HTML-in-canvas enabled.`);
  const h = J1(u), w = Math.ceil(e * h), x = Math.ceil(t * h), { delayRender: g, continueRender: p, cancelRender: y } = _t(), { isClientSideRendering: C, isRendering: b } = ae(), E = !b || C, P = v ? "copied" : s === void 0 && a === void 0 ? "direct" : b ? "copied" : "transferred";
  _l() || y(new Error(Y1()));
  const F = l.useRef(null), I = l.useRef(null), L = l.useRef(null), _ = l.useRef(null), O = `${e}x${t}@${h}-${P}`, N = l.useMemo(() => {
    const J = {
      pendingChildren: 0,
      generation: 0,
      release: null,
      blockPaint: () => {
        if (J.pendingChildren++, J.generation++, J.release === null) {
          const Z = g("waiting for nested HtmlInCanvas paint"), le = v?.blockPaint();
          J.release = () => {
            p(Z), le?.();
          };
        }
        let oe = !1;
        return () => {
          oe || (oe = !0, J.pendingChildren--, J.pendingChildren === 0 && F.current?.requestPaint?.());
        };
      }
    };
    return J;
  }, [p, g, v]), j = l.useCallback((J) => {
    P === "copied" ? I.current = J : F.current = J, typeof f == "function" ? f(J) : f && (f.current = J);
  }, [f, P]), V = Os(r), B = As({
    effects: n,
    overrideId: c?.overrideId ?? null,
    videoConfigValues: c?.videoConfigValues ?? null
  }), A = l.useRef(B);
  A.current = B;
  const T = l.useRef(s);
  T.current = s;
  const M = l.useRef(a);
  M.current = a;
  const R = l.useRef(!1), $ = l.useRef(null), z = l.useRef(!1), q = l.useRef(null), H = l.useRef(/* @__PURE__ */ new WeakMap()), U = l.useCallback(async () => {
    if (b && N.pendingChildren > 0)
      return;
    const J = N.generation, oe = _.current;
    if (!oe)
      throw new Error("Canvas or scene element not found");
    const Z = L.current;
    if (!Z)
      throw new Error("HtmlInCanvas: paint target is not ready because the canvas is remounting");
    const le = H.current.get(Z);
    if (b && le) {
      le.repaint = !0;
      return;
    }
    const de = { repaint: !1 };
    b && H.current.set(Z, de), Ca({
      target: Z,
      width: w,
      height: x
    });
    const pt = b ? v?.blockPaint() : null;
    let we = !1;
    try {
      const Re = F.current;
      if (!Re)
        throw new Error("Canvas not found");
      const ee = I.current, Oe = g("onPaint");
      if (!R.current) {
        const ie = M.current;
        if (!ie)
          R.current = !0;
        else {
          let Ee;
          try {
            Ee = Re.captureElementImage(oe);
          } catch (pe) {
            if (xa(pe) && E) {
              we = !0, p(Oe);
              return;
            }
            throw xa(pe) ? new Error(Vv) : pe;
          }
          R.current = !0;
          try {
            if (Z instanceof HTMLCanvasElement)
              throw new Error("HtmlInCanvas: onInit requires an OffscreenCanvas paint target");
            const pe = await ie({
              canvas: Z,
              element: oe,
              elementImage: Ee,
              pixelDensity: h
            });
            if (typeof pe != "function")
              throw new Error("HtmlInCanvas: when `onInit` is provided, it must return a cleanup function, or a Promise that resolves to one.");
            if (z.current || L.current !== Z) {
              pe(), p(Oe);
              return;
            }
            $.current = pe;
          } finally {
            Ee.close();
          }
        }
      }
      let be;
      try {
        be = Re.captureElementImage(oe);
      } catch (ie) {
        if (xa(ie) && E) {
          we = !0, p(Oe);
          return;
        }
        throw xa(ie) ? new Error(Vv) : ie;
      }
      let $e = null;
      try {
        const ie = T.current;
        if (ie) {
          if (Z instanceof HTMLCanvasElement)
            throw new Error("HtmlInCanvas: onPaint requires an OffscreenCanvas paint target");
          const pe = ie({
            canvas: Z,
            element: oe,
            elementImage: be,
            pixelDensity: h
          });
          pe && await pe;
        } else if (Z instanceof HTMLCanvasElement && A.current.some((pe) => !pe.params.disabled)) {
          q.current ?? (q.current = {
            source: document.createElement("canvas"),
            previousOutput: document.createElement("canvas")
          });
          const { source: pe, previousOutput: Et } = q.current;
          Ca({
            target: pe,
            width: w,
            height: x
          }), Ca({
            target: Et,
            width: w,
            height: x
          });
          const rt = pe.getContext("2d"), je = Et.getContext("2d"), Ue = Z.getContext("2d");
          if (!rt || !je || !Ue)
            throw new Error("Failed to acquire 2D context for <HtmlInCanvas> canvas");
          je.reset(), je.drawImage(Z, 0, 0), zv({
            canvas: Z,
            element: oe,
            elementImage: be,
            pixelDensity: h
          }), rt.reset(), rt.drawImage(Z, 0, 0), Ue.reset(), Ue.drawImage(Et, 0, 0), $e = pe;
        } else
          zv({
            canvas: Z,
            element: oe,
            elementImage: be,
            pixelDensity: h
          });
        const Ee = V.get(w, x);
        Ee && await Ls({
          state: Ee,
          source: $e ?? Z,
          effects: A.current,
          output: Z,
          width: w,
          height: x
        });
      } finally {
        be.close();
      }
      if (P === "copied" && L.current === Z && ee) {
        const ie = ee.getContext("2d");
        if (!ie)
          throw new Error("HtmlInCanvas: could not get layout canvas context");
        ie.reset(), ie.drawImage(Z, 0, 0);
      }
      we = !0, p(Oe);
    } catch (Re) {
      y(Re);
    } finally {
      if (we && N.pendingChildren === 0 && N.generation === J) {
        const { release: Re } = N;
        N.release = null, Re?.();
      }
      pt?.(), H.current.delete(Z), de.repaint && L.current === Z && F.current?.requestPaint?.();
    }
  }, [
    x,
    w,
    V,
    p,
    y,
    g,
    h,
    E,
    P,
    b,
    N,
    v
  ]);
  l.useLayoutEffect(() => () => {
    N.release?.(), N.release = null;
  }, [N]), l.useLayoutEffect(() => {
    const J = F.current;
    if (!J)
      throw new Error("Canvas not found");
    J.setAttribute("content", "drawable"), J.layoutSubtree = !0, _.current?.setAttribute("drawable", "");
    const oe = P === "direct" ? J : cI(J);
    return L.current = oe, Ca({
      target: oe,
      width: w,
      height: x
    }), R.current = !1, z.current = !1, J.addEventListener("paint", U), () => {
      J.removeEventListener("paint", U), L.current = null, R.current = !1, z.current = !0, $.current?.(), $.current = null;
    };
  }, [U, y, w, x, P]);
  const K = l.useRef(!1);
  l.useLayoutEffect(() => {
    if (!K.current) {
      K.current = !0;
      return;
    }
    const J = F.current;
    J && J.requestPaint?.();
  }, [s, B]), l.useLayoutEffect(() => {
    const J = F.current;
    if (!J)
      return;
    const oe = g("waiting for HtmlInCanvas paint"), Z = b ? v?.blockPaint() : null, le = () => {
      p(oe), Z?.();
    };
    return J.addEventListener("paint", le, { once: !0 }), J.requestPaint?.(), () => {
      J.removeEventListener("paint", le), le();
    };
  }, [
    e,
    t,
    p,
    g,
    O,
    m,
    b,
    v
  ]);
  const Q = l.useMemo(() => ({
    width: e,
    height: t
  }), [e, t]), X = l.useMemo(() => ({
    width: e,
    height: t,
    ...d ?? {}
  }), [t, d, e]);
  return /* @__PURE__ */ S.jsxs(af.Provider, {
    value: N,
    children: [
      /* @__PURE__ */ S.jsx("canvas", {
        ref: P === "copied" ? F : j,
        width: w,
        height: x,
        style: P === "copied" ? {
          ...X,
          position: "absolute",
          visibility: "hidden",
          pointerEvents: "none"
        } : X,
        children: /* @__PURE__ */ S.jsxs(Ur.Provider, {
          value: 0,
          children: [
            /* @__PURE__ */ S.jsx("div", {
              ref: _,
              style: P === "copied" ? { ...Q, visibility: "visible" } : Q,
              children: o
            }),
            i
          ]
        })
      }, O),
      P === "copied" ? /* @__PURE__ */ S.jsx("canvas", {
        ref: j,
        width: w,
        height: x,
        style: X
      }, `output-${O}`) : null
    ]
  });
});
pp.displayName = "HtmlInCanvasContent";
var X1 = l.forwardRef((e, t) => {
  const n = hn();
  return /* @__PURE__ */ S.jsx(pp, {
    ...e,
    ref: t,
    renderFrame: n
  });
});
X1.displayName = "HtmlInCanvasContentForRendering";
var eS = l.forwardRef(({
  width: e,
  height: t,
  effects: n = [],
  effectsOutputSize: r,
  children: o,
  onPaint: i,
  onInit: s,
  pixelDensity: a,
  _remotionInternalCanvasSiblings: u,
  _remotionInternalFallbackLabel: c = "Effects are not visible",
  controls: d,
  style: m,
  cropLeft: f,
  cropRight: v,
  cropTop: h,
  cropBottom: w,
  durationInFrames: x,
  premountFor: g,
  postmountFor: p,
  styleWhilePremounted: y,
  styleWhilePostmounted: C,
  name: b,
  ...E
}, k) => {
  const { isRendering: P } = ae(), F = Z1();
  Q1(e, t), J1(a);
  const I = P ? X1 : pp, L = _s(n), _ = l.useRef(null), O = l.useCallback(($) => {
    _.current = $, typeof k == "function" ? k($) : k && (k.current = $);
  }, [k]), {
    effectivePremountFor: N,
    effectivePostmountFor: j,
    freezeFrame: V,
    isPremountingOrPostmounting: B,
    premountingActive: A,
    postmountingActive: T,
    premountingStyle: M
  } = gn({
    from: E.from ?? 0,
    durationInFrames: Zt({
      durationInFrames: x,
      playbackRate: E.playbackRate,
      loop: E.loop
    }),
    premountFor: g ?? null,
    postmountFor: p ?? null,
    style: m ?? null,
    styleWhilePremounted: y ?? null,
    styleWhilePostmounted: C ?? null,
    hideWhilePremounted: "opacity"
  }), R = pr({
    cropLeft: f,
    cropRight: v,
    cropTop: h,
    cropBottom: w,
    style: M,
    componentName: "<HtmlInCanvas />"
  });
  return /* @__PURE__ */ S.jsx(vn, {
    frame: V,
    active: B,
    _remotionInternalIsPremounting: A,
    children: /* @__PURE__ */ S.jsx(mt, {
      layout: "none",
      durationInFrames: x,
      name: b ?? "<HtmlInCanvas>",
      _remotionInternalDocumentationLink: "https://www.remotion.dev/docs/remotion/html-in-canvas",
      controls: d,
      _remotionInternalEffects: L,
      ...E,
      _remotionInternalPremountDisplay: N || null,
      _remotionInternalPostmountDisplay: j || null,
      _remotionInternalIsPremounting: A,
      _remotionInternalIsPostmounting: T,
      children: !P && F !== null ? /* @__PURE__ */ S.jsx(G1, {
        style: { width: e, height: t, ...R },
        label: c,
        children: /* @__PURE__ */ S.jsx(Ur.Provider, {
          value: 0,
          children: /* @__PURE__ */ S.jsx("div", {
            style: { width: e, height: t },
            children: o
          })
        })
      }) : /* @__PURE__ */ S.jsx(I, {
        ref: O,
        renderFrame: null,
        width: e,
        height: t,
        effects: n,
        effectsOutputSize: r ?? null,
        onPaint: i,
        onInit: s,
        pixelDensity: a,
        canvasSiblings: u ?? null,
        controls: d,
        style: R ?? void 0,
        children: o
      })
    })
  });
});
eS.displayName = "HtmlInCanvas";
var fI = {
  ...jn,
  ...Jt,
  pixelDensity: {
    type: "number",
    min: 1,
    max: 3,
    step: 0.1,
    default: 1,
    description: "Pixel density",
    hiddenFromList: !1
  },
  ...At,
  ...Ln,
  ..._n,
  ...An,
  ...On
}, mI = $t({
  Component: eS,
  componentName: "<HtmlInCanvas>",
  componentIdentity: "dev.remotion.remotion.HtmlInCanvas",
  schema: fI,
  supportsEffects: !0
}), tS = Object.assign(mI, {
  isSupported: _l,
  isNestingSupported: mp
});
tS.displayName = "HtmlInCanvas";
Le(tS);
function fn(e) {
  return typeof e != "string" ? String(e) : e.length > 100 && (e.startsWith("data:") || e.startsWith("blob:")) ? e.slice(0, 60) + "...[" + e.length + " chars total]" : e;
}
var pI = {
  src: {
    type: "asset",
    assetType: "image",
    default: void 0,
    description: "Source",
    keyframable: !1
  },
  ...I0,
  ...On,
  ...Jt,
  fit: {
    type: "enum",
    default: "fill",
    description: "Fit",
    variants: {
      fill: {},
      contain: {},
      cover: {}
    }
  },
  ...At,
  ...Ln,
  ..._n,
  ...An
}, hI = (e, t, n, { markAsReady: r }) => {
  const o = e.current;
  !o || o.continued || (o.continued = !0, r && t(!1), n(o.handle), e.current = null);
}, vI = (e, t, n) => {
  e(n), typeof t == "function" ? t(n) : t && (t.current = n);
}, gI = () => {
  if (typeof DOMException < "u")
    return new DOMException("Image loading was aborted", "AbortError");
  const e = new Error("Image loading was aborted");
  return e.name = "AbortError", e;
}, yI = ({
  src: e,
  signal: t,
  crossOrigin: n
}) => new Promise((r, o) => {
  const i = new Image();
  let s = !1;
  function a() {
    i.onload = null, i.onerror = null;
  }
  function u(d) {
    s || (s = !0, a(), d());
  }
  function c() {
    u(() => o(gI()));
  }
  if (i.onload = () => {
    Promise.resolve(i.decode?.()).catch(() => {
    }).then(() => {
      const d = i.naturalWidth || i.width, m = i.naturalHeight || i.height;
      if (d <= 0 || m <= 0) {
        u(() => o(new Error(`Could not determine dimensions for <CanvasImage> with src="${fn(e)}"`)));
        return;
      }
      u(() => r({ element: i, width: d, height: m }));
    });
  }, i.onerror = () => {
    u(() => o(new Error(`Could not load <CanvasImage> with src="${fn(e)}"`)));
  }, t.addEventListener("abort", c, { once: !0 }), t.aborted) {
    c();
    return;
  }
  i.crossOrigin = n || "anonymous", i.src = e;
});
function wI(e) {
  return 1e3 * 2 ** (e - 1);
}
var SI = ({
  onFrame: e
}) => {
  if (typeof requestAnimationFrame > "u")
    return e(), () => {
    };
  const t = requestAnimationFrame(e);
  return () => cancelAnimationFrame(t);
}, nS = l.forwardRef(({
  src: e,
  crossOrigin: t,
  width: n,
  height: r,
  fit: o = "fill",
  effects: i,
  effectsOutputSize: s,
  controls: a,
  onError: u,
  className: c,
  style: d,
  id: m,
  pauseWhenLoading: f,
  maxRetries: v = 2,
  delayRenderRetries: h,
  delayRenderTimeoutInMilliseconds: w,
  ...x
}, g) => {
  const { delayRender: p, continueRender: y, cancelRender: C } = _t(), { delayPlayback: b } = Nl(), [E, k] = l.useState(null), [P, F] = l.useState(null), I = Yr(e), L = Os(s), _ = As({
    effects: i,
    overrideId: a?.overrideId ?? null,
    videoConfigValues: a?.videoConfigValues ?? null
  }), O = l.useContext(ge), N = l.useRef(null), [j, V] = l.useState(!1), B = !!O?.premounting, A = !!O?.postmounting, T = l.useMemo(() => hI.bind(null, N, V, y), [y]), M = l.useMemo(() => typeof document > "u" ? null : document.createElement("canvas"), []), R = l.useMemo(() => vI.bind(null, k, g), [g]);
  return l.useLayoutEffect(() => {
    if (!(!f || !j || B || A))
      return b().unblock;
  }, [
    b,
    j,
    A,
    B,
    f
  ]), l.useLayoutEffect(() => {
    const $ = p(`Rendering <CanvasImage> with src="${fn(I)}"`, {
      retries: h ?? void 0,
      timeoutInMilliseconds: w ?? void 0
    }), z = new AbortController();
    let q = !1, H = 0, U = null;
    F(null), V(!0), N.current = {
      handle: $,
      continued: !1
    };
    const K = () => {
      yI({ src: I, signal: z.signal, crossOrigin: t }).then((Q) => {
        q || F(Q);
      }).catch((Q) => {
        if (Q.name === "AbortError") {
          T({ markAsReady: !1 });
          return;
        }
        if (H++, H <= v) {
          const X = wI(H);
          console.warn(`Could not load <CanvasImage> with src="${fn(I)}", retrying in ${X}ms`), U = setTimeout(() => {
            q || K();
          }, X);
        } else u ? (u(Q), T({ markAsReady: !0 })) : C(Q);
      });
    };
    return K(), () => {
      q = !0, U !== null && clearTimeout(U), z.abort(), T({ markAsReady: !1 });
    };
  }, [
    I,
    C,
    T,
    t,
    p,
    h,
    w,
    v,
    u
  ]), l.useLayoutEffect(() => {
    if (!P || !E || !M)
      return;
    const $ = p(`Applying effects to <CanvasImage> with src="${fn(I)}"`);
    let z = !1, q = !1, H = () => {
    };
    const U = () => {
      q || (q = !0, y($));
    }, K = n ?? P.width, Q = r ?? P.height, X = M.getContext("2d", {
      colorSpace: "srgb"
    });
    return X ? (M.width = K, M.height = Q, E.width = K, E.height = Q, X.clearRect(0, 0, K, Q), X.drawImage(P.element, ...g1(o, { width: P.width, height: P.height }, { width: K, height: Q })), Ls({
      state: L.get(K, Q),
      source: M,
      effects: _,
      output: E,
      width: K,
      height: Q
    }).then((J) => {
      J && !z && (H = SI({
        onFrame: () => {
          z || (U(), T({ markAsReady: !0 }));
        }
      }));
    }).catch((J) => {
      z || (u ? (u(J), U(), T({ markAsReady: !0 })) : C(J));
    }), () => {
      z = !0, H(), U();
    }) : (C(new Error("Could not get 2D context for <CanvasImage> source canvas")), U(), () => {
      U();
    });
  }, [
    I,
    C,
    L,
    y,
    T,
    p,
    o,
    r,
    P,
    _,
    u,
    E,
    M,
    n
  ]), /* @__PURE__ */ S.jsx("canvas", {
    ...x,
    ref: R,
    width: n,
    height: r,
    className: c,
    style: d,
    id: m
  });
});
nS.displayName = "CanvasImageContent";
var xI = l.forwardRef(({
  src: e,
  crossOrigin: t,
  width: n,
  height: r,
  fit: o,
  effects: i = [],
  effectsOutputSize: s,
  className: a,
  style: u,
  id: c,
  onError: d,
  pauseWhenLoading: m,
  maxRetries: f,
  delayRenderRetries: v,
  delayRenderTimeoutInMilliseconds: h,
  durationInFrames: w,
  from: x,
  trimBefore: g,
  loop: p,
  freeze: y,
  premountFor: C,
  postmountFor: b,
  styleWhilePremounted: E,
  styleWhilePostmounted: k,
  hidden: P,
  name: F,
  showInTimeline: I,
  cropLeft: L,
  cropRight: _,
  cropTop: O,
  cropBottom: N,
  controls: j,
  _remotionInternalDocumentationLink: V,
  _remotionInternalCropComponentName: B,
  ...A
}, T) => {
  if (!e)
    throw new Error('No "src" prop was passed to <CanvasImage>.');
  const M = l.useMemo(() => ({
    type: "image",
    src: e
  }), [e]), R = _s(i), $ = l.useRef(null);
  l.useImperativeHandle(T, () => $.current, []);
  const {
    effectivePostmountFor: z,
    effectivePremountFor: q,
    freezeFrame: H,
    isPremountingOrPostmounting: U,
    postmountingActive: K,
    premountingActive: Q,
    premountingStyle: X
  } = gn({
    from: x ?? 0,
    durationInFrames: Zt({
      durationInFrames: w,
      playbackRate: void 0,
      loop: p
    }),
    premountFor: C ?? null,
    postmountFor: b ?? null,
    style: u ?? null,
    styleWhilePremounted: E ?? null,
    styleWhilePostmounted: k ?? null,
    hideWhilePremounted: "display-none"
  }), J = pr({
    cropLeft: L,
    cropRight: _,
    cropTop: O,
    cropBottom: N,
    style: X,
    componentName: B ?? "<CanvasImage />"
  });
  return /* @__PURE__ */ S.jsx(vn, {
    frame: H,
    active: U,
    _remotionInternalIsPremounting: Q,
    children: /* @__PURE__ */ S.jsx(mt, {
      layout: "none",
      from: x ?? 0,
      trimBefore: g,
      loop: p,
      durationInFrames: w,
      freeze: y,
      hidden: P,
      showInTimeline: I ?? !0,
      name: F ?? "<CanvasImage>",
      _remotionInternalDocumentationLink: V ?? "https://www.remotion.dev/docs/canvasimage",
      controls: j,
      _remotionInternalEffects: R,
      _remotionInternalIsMedia: M,
      _remotionInternalPremountDisplay: q || null,
      _remotionInternalPostmountDisplay: z || null,
      _remotionInternalIsPremounting: Q,
      _remotionInternalIsPostmounting: K,
      children: /* @__PURE__ */ S.jsx(Wr, {
        children: /* @__PURE__ */ S.jsx(nS, {
          ref: $,
          src: e,
          crossOrigin: t,
          width: n,
          height: r,
          fit: o,
          effects: i,
          effectsOutputSize: s ?? null,
          controls: j,
          className: a,
          style: J ?? void 0,
          id: c,
          onError: d,
          pauseWhenLoading: m,
          maxRetries: f,
          delayRenderRetries: v,
          delayRenderTimeoutInMilliseconds: h,
          ...A
        })
      })
    })
  });
}), hp = $t({
  Component: xI,
  componentName: "<CanvasImage>",
  componentIdentity: "dev.remotion.remotion.CanvasImage",
  schema: pI,
  supportsEffects: !0
});
hp.displayName = "CanvasImage";
Le(hp);
var CI = ({
  onLoad: e,
  onError: t,
  delayRenderRetries: n,
  delayRenderTimeoutInMilliseconds: r,
  ...o
}, i) => {
  const { delayRender: s, continueRender: a } = _t(), u = l.useRef(null), c = l.useRef(null), { src: d, srcDoc: m } = o;
  l.useLayoutEffect(() => {
    if (c.current?.src === d && c.current?.srcDoc === m && c.current !== null)
      return;
    const h = s(`Loading <IFrame> with source ${d}`, {
      retries: n ?? void 0,
      timeoutInMilliseconds: r ?? void 0
    });
    return c.current = null, u.current = h, () => {
      a(h), u.current = null;
    };
  }, [
    a,
    s,
    n,
    r,
    d,
    m
  ]);
  const f = l.useCallback((h) => {
    c.current = { src: d, srcDoc: m }, u.current !== null && (a(u.current), u.current = null), e?.(h);
  }, [e, a, d, m]), v = l.useCallback((h) => {
    c.current = { src: d, srcDoc: m }, u.current !== null && (a(u.current), u.current = null), t ? t(h) : console.error("Error loading iframe:", h, "Handle the event using the onError() prop to make this message disappear.");
  }, [t, a, d, m]);
  return /* @__PURE__ */ S.jsx("iframe", {
    referrerPolicy: "strict-origin-when-cross-origin",
    ...o,
    ref: i,
    onError: v,
    onLoad: f
  });
};
l.forwardRef(CI);
function bI(e) {
  return 1e3 * 2 ** (e - 1);
}
var EI = (e, t, n) => {
  e.current = n, typeof t == "function" ? t(n) : t && (t.current = n);
}, kI = (e, t) => {
  if (!e.current)
    return;
  const n = e.current.src;
  setTimeout(() => {
    if (!e.current)
      return;
    const r = e.current?.src;
    r === n && (e.current.removeAttribute("src"), e.current.setAttribute("src", r));
  }, t);
}, PI = ({
  errors: e,
  imageRef: t,
  onError: n,
  onImageError: r,
  maxRetries: o,
  cancelRender: i,
  retryIn: s
}, a) => {
  if (e.current) {
    if (e.current[t.current?.src] = (e.current[t.current?.src] ?? 0) + 1, (n || r) && (e.current[t.current?.src] ?? 0) > o) {
      n?.(a), r?.(new Error("Error loading image with src: " + fn(t.current?.src)));
      return;
    }
    if ((e.current[t.current?.src] ?? 0) <= o) {
      const u = bI(e.current[t.current?.src] ?? 0);
      console.warn(`Could not load image with source ${fn(t.current?.src)}, retrying again in ${u}ms`), s(u);
      return;
    }
    try {
      i("Error loading image with src: " + fn(t.current?.src));
    } catch {
    }
  }
}, II = ({
  imageRef: e,
  errors: t,
  actualSrc: n,
  delayRenderRetries: r,
  delayRenderTimeoutInMilliseconds: o,
  onImageFrame: i,
  delayRender: s,
  continueRender: a,
  setIsLoading: u
}) => {
  if (window.process?.env?.NODE_ENV === "test") {
    e.current && (e.current.src = n);
    return;
  }
  const { current: c } = e;
  if (!c)
    return;
  u(!0);
  const d = s("Loading <Img> with src=" + fn(n), {
    retries: r ?? void 0,
    timeoutInMilliseconds: o ?? void 0
  });
  let m = !1;
  const f = () => {
    if (m) {
      a(d);
      return;
    }
    (t.current[e.current?.src] ?? 0) > 0 && (delete t.current[e.current?.src], console.info(`Retry successful - ${fn(e.current?.src)} is now loaded`)), c && i?.(c), u(!1), a(d);
  };
  if (!e.current) {
    f();
    return;
  }
  return c.src = n, c.decode().then(f).catch((v) => {
    console.warn(v), c.complete && c.naturalWidth > 0 && c.naturalHeight > 0 ? f() : c.addEventListener("load", f);
  }), () => {
    m = !0, c.removeEventListener("load", f), a(d);
  };
}, TI = ({
  onError: e,
  onImageError: t,
  maxRetries: n = 2,
  src: r,
  pauseWhenLoading: o,
  delayRenderRetries: i,
  delayRenderTimeoutInMilliseconds: s,
  onImageFrame: a,
  crossOrigin: u,
  decoding: c,
  ref: d,
  ...m
}) => {
  const f = l.useRef(null), v = l.useRef({}), { delayPlayback: h } = Nl(), w = l.useContext(ge), [x, g] = l.useState(!1), p = l.useMemo(() => EI.bind(null, f, d ?? null), [d]), y = Yr(r), C = l.useMemo(() => kI.bind(null, f), []), { delayRender: b, continueRender: E, cancelRender: k } = _t(), P = !!w?.premounting, F = !!w?.postmounting, I = l.useMemo(() => PI.bind(null, {
    errors: v,
    imageRef: f,
    onError: e ?? null,
    onImageError: t ?? null,
    maxRetries: n,
    cancelRender: k,
    retryIn: C
  }), [k, n, e, t, C]);
  typeof window < "u" && (l.useLayoutEffect(() => {
    if (!(!o || !x || P || F))
      return h().unblock;
  }, [
    h,
    x,
    F,
    P,
    o
  ]), l.useLayoutEffect(II.bind(null, {
    imageRef: f,
    errors: v,
    actualSrc: y,
    delayRenderRetries: i ?? null,
    delayRenderTimeoutInMilliseconds: s ?? null,
    onImageFrame: a ?? null,
    delayRender: b,
    continueRender: E,
    setIsLoading: g
  }), [
    y,
    i,
    s,
    a,
    E,
    b
  ]));
  const { isClientSideRendering: L, isRendering: _ } = ae(), O = rp({
    crossOrigin: u,
    requestsVideoFrame: !1,
    isClientSideRendering: L
  });
  return /* @__PURE__ */ S.jsx("img", {
    ...m,
    ref: p,
    crossOrigin: O,
    onError: I,
    decoding: _ ? "sync" : c
  });
}, RI = ({
  hidden: e,
  name: t,
  showInTimeline: n,
  src: r,
  from: o,
  trimBefore: i,
  loop: s,
  durationInFrames: a,
  freeze: u,
  premountFor: c,
  postmountFor: d,
  style: m,
  styleWhilePremounted: f,
  styleWhilePostmounted: v,
  cropLeft: h,
  cropRight: w,
  cropTop: x,
  cropBottom: g,
  controls: p,
  ...y
}) => {
  if (!r)
    throw new Error('No "src" prop was passed to <Img>.');
  const C = l.useMemo(() => ({
    type: "image",
    src: r
  }), [r]), {
    effectivePostmountFor: b,
    effectivePremountFor: E,
    freezeFrame: k,
    isPremountingOrPostmounting: P,
    postmountingActive: F,
    premountingActive: I,
    premountingStyle: L
  } = gn({
    from: o ?? 0,
    durationInFrames: Zt({
      durationInFrames: a,
      playbackRate: void 0,
      loop: s
    }),
    premountFor: c ?? null,
    postmountFor: d ?? null,
    style: m ?? null,
    styleWhilePremounted: f ?? null,
    styleWhilePostmounted: v ?? null,
    hideWhilePremounted: "display-none"
  }), _ = pr({
    cropLeft: h,
    cropRight: w,
    cropTop: x,
    cropBottom: g,
    style: L,
    componentName: "<Img />"
  });
  return /* @__PURE__ */ S.jsx(vn, {
    frame: k,
    active: P,
    _remotionInternalIsPremounting: I,
    children: /* @__PURE__ */ S.jsx(mt, {
      layout: "none",
      from: o ?? 0,
      trimBefore: i,
      loop: s,
      durationInFrames: a,
      freeze: u,
      _remotionInternalDocumentationLink: "https://www.remotion.dev/docs/img",
      _remotionInternalIsMedia: C,
      _remotionInternalPremountDisplay: E || null,
      _remotionInternalPostmountDisplay: b || null,
      _remotionInternalIsPremounting: I,
      _remotionInternalIsPostmounting: F,
      name: t ?? "<Img>",
      controls: p,
      showInTimeline: n ?? !0,
      hidden: e,
      children: /* @__PURE__ */ S.jsx(Wr, {
        children: /* @__PURE__ */ S.jsx(TI, {
          src: r,
          style: _ ?? void 0,
          ...y
        })
      })
    })
  });
}, FI = hp, MI = {
  src: {
    type: "asset",
    assetType: "image",
    default: void 0,
    description: "Source",
    keyframable: !1
  },
  ...I0,
  ...On,
  ...Jt,
  ...At,
  ...Ln,
  ..._n,
  ...An
}, NI = /* @__PURE__ */ new Set([
  "alt",
  "decoding",
  "fetchPriority",
  "loading",
  "onError",
  "onImageFrame",
  "onLoad",
  "sizes",
  "srcSet",
  "useMap"
]), $I = (e) => Object.keys(e).filter((t) => e[t] !== void 0 && NI.has(t)), _I = (e) => e.map((t) => `"${t}"`).join(", "), AI = ({
  props: e,
  ref: t,
  width: n,
  height: r
}) => {
  if (typeof n == "string" || typeof r == "string")
    throw new Error('The "width" and "height" props must be numbers on <Img> when effects are passed, because <Img> renders a <CanvasImage>. Use numeric props or CSS dimensions in "style".');
  const o = $I(e);
  if (t != null && o.unshift("ref"), o.length !== 0)
    throw new Error(`The ${_I(o)} prop${o.length === 1 ? "" : "s"} cannot be used on <Img> when effects are passed, because <Img> renders a <canvas> instead of a native <img>. Remove ${o.length === 1 ? "this prop" : "these props"}.`);
}, LI = (e) => {
  const t = e?.objectFit;
  if (t === "fill" || t === "contain" || t === "cover")
    return t;
}, OI = ({
  effects: e = [],
  effectsOutputSize: t,
  ref: n,
  hidden: r,
  name: o,
  showInTimeline: i,
  src: s,
  from: a,
  trimBefore: u,
  durationInFrames: c,
  freeze: d,
  premountFor: m,
  postmountFor: f,
  styleWhilePremounted: v,
  styleWhilePostmounted: h,
  controls: w,
  width: x,
  height: g,
  className: p,
  style: y,
  cropLeft: C,
  cropRight: b,
  cropTop: E,
  cropBottom: k,
  id: P,
  pauseWhenLoading: F,
  maxRetries: I,
  delayRenderRetries: L,
  delayRenderTimeoutInMilliseconds: _,
  onImageError: O,
  ...N
}) => {
  const j = Ps(F);
  if (e.length === 0)
    return /* @__PURE__ */ S.jsx(RI, {
      ...N,
      ref: n,
      hidden: r,
      name: o,
      showInTimeline: i,
      src: s,
      from: a,
      trimBefore: u,
      durationInFrames: c,
      freeze: d,
      premountFor: m,
      postmountFor: f,
      styleWhilePremounted: v,
      styleWhilePostmounted: h,
      controls: w,
      width: x,
      height: g,
      className: p,
      style: y,
      cropLeft: C,
      cropRight: b,
      cropTop: E,
      cropBottom: k,
      id: P,
      pauseWhenLoading: j,
      maxRetries: I,
      delayRenderRetries: L,
      delayRenderTimeoutInMilliseconds: _,
      onImageError: O
    });
  if (!s)
    throw new Error('No "src" prop was passed to <Img>.');
  AI({
    props: N,
    ref: n,
    width: x,
    height: g
  });
  const V = typeof x == "number" ? x : void 0, B = typeof g == "number" ? g : void 0, A = N, T = LI(y) ?? "fill";
  return /* @__PURE__ */ S.jsx(FI, {
    src: s,
    width: V,
    height: B,
    fit: T,
    effects: e,
    effectsOutputSize: t,
    className: p,
    style: y,
    cropLeft: C,
    cropRight: b,
    cropTop: E,
    cropBottom: k,
    id: P,
    onError: O,
    pauseWhenLoading: j,
    maxRetries: I,
    delayRenderRetries: L,
    delayRenderTimeoutInMilliseconds: _,
    from: a,
    trimBefore: u,
    durationInFrames: c,
    freeze: d,
    premountFor: m,
    postmountFor: f,
    styleWhilePremounted: v,
    styleWhilePostmounted: h,
    hidden: r,
    name: o ?? "<Img>",
    showInTimeline: i,
    _remotionInternalDocumentationLink: "https://www.remotion.dev/docs/img",
    _remotionInternalCropComponentName: "<Img />",
    controls: w,
    ...A
  });
}, rS = $t({
  Component: OI,
  componentName: "<Img>",
  componentIdentity: "dev.remotion.remotion.Img",
  schema: MI,
  supportsEffects: !0
});
Le(rS);
var jI = (e) => {
  if (e === "remotion")
    return "dev.remotion.remotion";
  if (e.startsWith("@remotion/"))
    return `dev.remotion.${e.slice(10).replace(/-([a-z])/g, (n, r) => r.toUpperCase())}`;
  throw new Error(`Unsupported Remotion package name: ${e}`);
}, oS = ({
  packageName: e,
  componentName: t
}) => `${jI(e)}.${t}`, Al = {
  ...jn,
  ...Jt,
  ...At,
  ...On
}, DI = {
  ...Al,
  ...Ln
}, iS = {
  ...DI,
  ..._n,
  ...An
}, VI = {
  ...iS,
  ...Rs,
  ...dl
}, zI = {
  ...Al,
  ...cl,
  ...Rs,
  ...dl
}, sS = {
  ...Al,
  ...cl
}, BI = {
  ...sS,
  d: {
    type: "svg-path",
    default: void 0,
    description: "Path",
    keyframable: !0
  }
}, UI = {
  ...Al,
  ..._m
}, WI = {
  ...iS,
  ...cl
}, qI = (e, t) => {
  typeof e == "function" ? e(t) : e && (e.current = t);
}, vp = (e) => {
  const t = e;
  if (!t.wrapInSequence) {
    const d = $t(t);
    return Le(d), d;
  }
  const {
    Component: n,
    componentName: r,
    schema: o,
    wrapInSequence: i,
    layout: s = "none",
    ...a
  } = t, u = l.forwardRef((d, m) => {
    const { canvasContent: f, compositions: v } = l.useContext(Dr), h = vm(c), w = v.some((Z) => f?.type === "composition" && Z.id === f.compositionId && Z.componentFromProps === h), { width: x, height: g, ...p } = d, {
      durationInFrames: y,
      from: C,
      trimBefore: b,
      playbackRate: E,
      loop: k,
      freeze: P,
      hidden: F,
      name: I,
      showInTimeline: L,
      controls: _,
      premountFor: O,
      postmountFor: N,
      styleWhilePremounted: j,
      styleWhilePostmounted: V,
      ...B
    } = s === "absolute-fill" ? p : d, {
      cropLeft: A,
      cropRight: T,
      cropTop: M,
      cropBottom: R,
      style: $,
      ...z
    } = B, {
      effectivePremountFor: q,
      effectivePostmountFor: H,
      freezeFrame: U,
      isPremountingOrPostmounting: K,
      premountingActive: Q,
      postmountingActive: X,
      premountingStyle: J
    } = gn({
      from: C ?? 0,
      durationInFrames: Zt({
        durationInFrames: y,
        playbackRate: E,
        loop: k
      }),
      premountFor: O ?? null,
      postmountFor: N ?? null,
      style: $ ?? null,
      styleWhilePremounted: j ?? null,
      styleWhilePostmounted: V ?? null,
      hideWhilePremounted: "opacity"
    }), oe = pr({
      cropLeft: A,
      cropRight: T,
      cropTop: M,
      cropBottom: R,
      style: J,
      componentName: r
    });
    return /* @__PURE__ */ S.jsx(vn, {
      frame: U,
      active: K,
      children: /* @__PURE__ */ S.jsx(bl, {
        _remotionInternalSingleChildComponent: w ? null : h,
        layout: s,
        ...s === "absolute-fill" ? {
          width: x,
          height: g,
          style: { overflow: "hidden", ...oe },
          ref: m
        } : {},
        durationInFrames: y,
        from: C,
        trimBefore: b,
        playbackRate: E,
        loop: k,
        freeze: P,
        hidden: F,
        name: I ?? r,
        _remotionInternalDocumentationLink: "https://www.remotion.dev/docs/interactive-create",
        showInTimeline: w ? !1 : L,
        controls: _,
        _remotionInternalPremountDisplay: q || null,
        _remotionInternalPostmountDisplay: H || null,
        _remotionInternalIsPremounting: Q,
        _remotionInternalIsPostmounting: X,
        children: D.createElement(n, {
          ...z,
          ...s === "none" ? { style: oe ?? void 0, ref: m } : {}
        })
      })
    });
  }), c = $t({
    ...a,
    Component: u,
    componentName: r,
    schema: {
      ...o,
      ...At,
      ...jn,
      ...Jt,
      ...On
    },
    supportsEffects: !1
  });
  return Le(c), c;
}, HI = (e) => {
  const t = e;
  return vp({
    ...t,
    wrapInSequence: !0,
    schema: t.schema ?? {},
    componentName: t.componentName ?? (t.Component.displayName || t.Component.name?.replace(/(.+)Inner$/, "$1") || "Component")
  });
}, Oo = (e, t, n) => {
  const r = l.forwardRef((i, s) => {
    const {
      durationInFrames: a,
      from: u,
      premountFor: c,
      postmountFor: d,
      styleWhilePremounted: m,
      styleWhilePostmounted: f,
      trimBefore: v,
      playbackRate: h,
      loop: w,
      freeze: x,
      hidden: g,
      name: p,
      showInTimeline: y,
      controls: C,
      cropLeft: b,
      cropRight: E,
      cropTop: k,
      cropBottom: P,
      style: F,
      ...I
    } = i, {
      effectivePremountFor: L,
      effectivePostmountFor: _,
      freezeFrame: O,
      isPremountingOrPostmounting: N,
      premountingActive: j,
      postmountingActive: V,
      premountingStyle: B
    } = gn({
      from: u ?? 0,
      durationInFrames: Zt({
        durationInFrames: a,
        playbackRate: h,
        loop: w
      }),
      premountFor: c ?? null,
      postmountFor: d ?? null,
      style: F ?? null,
      styleWhilePremounted: m ?? null,
      styleWhilePostmounted: f ?? null,
      hideWhilePremounted: "opacity"
    }), A = pr({
      cropLeft: b,
      cropRight: E,
      cropTop: k,
      cropBottom: P,
      style: B,
      componentName: t
    }), T = l.useCallback((M) => {
      qI(s, M);
    }, [s]);
    return /* @__PURE__ */ S.jsx(vn, {
      frame: O,
      active: N,
      _remotionInternalIsPremounting: j,
      children: /* @__PURE__ */ S.jsx(mt, {
        layout: "none",
        from: u ?? 0,
        trimBefore: v,
        playbackRate: h,
        loop: w,
        durationInFrames: a,
        freeze: x,
        hidden: g,
        name: p ?? t,
        showInTimeline: y ?? !0,
        controls: C,
        _remotionInternalDocumentationLink: "https://www.remotion.dev/docs/interactive",
        _remotionInternalPremountDisplay: L || null,
        _remotionInternalPostmountDisplay: _ || null,
        _remotionInternalIsPremounting: j,
        _remotionInternalIsPostmounting: V,
        children: D.createElement(e, {
          ...I,
          style: A ?? void 0,
          ref: T
        })
      })
    });
  });
  r.displayName = t;
  const o = vp({
    Component: r,
    componentName: t,
    componentIdentity: oS({
      packageName: "remotion",
      componentName: t.slice(1, -1)
    }),
    schema: n,
    supportsEffects: !1
  });
  return o.displayName = t, o;
}, fe = (e, t) => Oo(e, t, VI), ba = (e, t) => Oo(e, t, sS), KI = (e, t) => Oo(e, t, UI), Cn = {
  baseSchema: jn,
  captionsSchema: JE,
  childrenSchema: dl,
  transformSchema: At,
  textSchema: Rs,
  backgroundSchema: Ln,
  borderSchema: _n,
  borderRadiusSchema: An,
  cropSchema: On,
  svgPaintSchema: cl,
  svgStrokeSchema: _m,
  premountSchema: Jt,
  sequenceSchema: _r,
  withSchema: vp,
  create: HI,
  _internalMakeRemotionComponentIdentity: oS,
  A: fe("a", "<Interactive.A>"),
  Article: fe("article", "<Interactive.Article>"),
  Aside: fe("aside", "<Interactive.Aside>"),
  Button: fe("button", "<Interactive.Button>"),
  Circle: ba("circle", "<Interactive.Circle>"),
  Code: fe("code", "<Interactive.Code>"),
  Div: fe("div", "<Interactive.Div>"),
  Ellipse: ba("ellipse", "<Interactive.Ellipse>"),
  Em: fe("em", "<Interactive.Em>"),
  Footer: fe("footer", "<Interactive.Footer>"),
  G: ba("g", "<Interactive.G>"),
  H1: fe("h1", "<Interactive.H1>"),
  H2: fe("h2", "<Interactive.H2>"),
  H3: fe("h3", "<Interactive.H3>"),
  H4: fe("h4", "<Interactive.H4>"),
  H5: fe("h5", "<Interactive.H5>"),
  H6: fe("h6", "<Interactive.H6>"),
  Header: fe("header", "<Interactive.Header>"),
  Label: fe("label", "<Interactive.Label>"),
  Li: fe("li", "<Interactive.Li>"),
  Line: KI("line", "<Interactive.Line>"),
  Main: fe("main", "<Interactive.Main>"),
  Nav: fe("nav", "<Interactive.Nav>"),
  Ol: fe("ol", "<Interactive.Ol>"),
  P: fe("p", "<Interactive.P>"),
  Path: Oo("path", "<Interactive.Path>", BI),
  Pre: fe("pre", "<Interactive.Pre>"),
  Rect: ba("rect", "<Interactive.Rect>"),
  Section: fe("section", "<Interactive.Section>"),
  Small: fe("small", "<Interactive.Small>"),
  Span: fe("span", "<Interactive.Span>"),
  Strong: fe("strong", "<Interactive.Strong>"),
  Svg: Oo("svg", "<Interactive.Svg>", WI),
  Text: Oo("text", "<Interactive.Text>", zI),
  Ul: fe("ul", "<Interactive.Ul>")
}, GI = 0.1, YI = (e) => {
  const { baseLatency: t, outputLatency: n } = e, r = n === 0 ? 0.3 : n;
  return GI + t + r;
}, aS = D.createRef(), Bv = typeof window > "u" ? l.useEffect : l.useLayoutEffect, QI = jr(zw.Provider), uS = l.forwardRef(({ children: e, onSnapshot: t }, n) => {
  const { isStudio: r } = ae(), [o] = l.useState(() => String(Math.random())), [i, s] = l.useState(() => r && pm()), a = l.useRef(!1), u = l.useRef(!1), c = l.useRef(!1), d = l.useRef(t), m = l.useRef(null), f = l.useRef(null), v = l.useCallback(() => {
    const p = f.current;
    if (f.current = null, p === null || c.current)
      return;
    const y = typeof p == "function" ? p() : p, C = m.current;
    C !== null && (C.compositions === y.compositions || C.compositions.length === y.compositions.length && C.compositions.every((b, E) => b === y.compositions[E])) && (C.folders === y.folders || C.folders.length === y.folders.length && C.folders.every((b, E) => b === y.folders[E])) && (C.orderIds === y.orderIds || C.orderIds.length === y.orderIds.length && C.orderIds.every((b, E) => b === y.orderIds[E])) || (m.current = y, d.current(y));
  }, []);
  l.useImperativeHandle(n, () => v, [v]);
  const h = l.useCallback((p) => {
    const y = f.current !== null;
    f.current = p, !y && queueMicrotask(v);
  }, [v]), w = l.useCallback((p) => {
    u.current || (a.current = !0, h(p));
  }, [h]), x = l.useMemo(() => {
    const p = /* @__PURE__ */ new Map(), y = () => {
      const C = [], b = [], E = [];
      for (const k of p.values())
        k.type === "composition" ? (C.push(k.value), E.push(Jh({
          type: "composition",
          id: k.value.id
        }))) : (b.push(k.value), E.push(Jh({
          type: "folder",
          id: Eu(k.value)
        })));
      return { compositions: C, folders: b, orderIds: E };
    };
    return { entries: p, notifyCommit: () => h(y) };
  }, [h]);
  Bv(() => {
    if (d.current !== t) {
      const p = m.current;
      m.current = null, i && p !== null && h(p);
    }
    d.current = t, i || x.notifyCommit();
  }, [x, t, h, i]), Bv(() => {
    c.current = !1;
    let p = !1;
    const y = () => {
      u.current || (u.current = !0, f.current = null, queueMicrotask(() => {
        c.current || s(!1);
      }));
    };
    return r && (window.addEventListener($r, y), i && queueMicrotask(() => {
      !p && !a.current && y();
    })), () => {
      p = !0, c.current = !0, r && window.removeEventListener($r, y);
    };
  }, [r, i]);
  const g = l.useMemo(() => r ? {
    type: "composition-manager",
    id: o,
    onCommit: i ? w : null
  } : null, [r, o, w, i]);
  return /* @__PURE__ */ S.jsx(QI, {
    value: i ? null : x,
    _remotionCommitMetadata: g,
    children: e
  });
}), JI = ({
  children: e,
  onlyRenderComposition: t,
  currentCompositionMetadata: n,
  initialCompositions: r,
  initialCanvasContent: o
}) => {
  const i = l.useRef(/* @__PURE__ */ new Set()), s = l.useRef(null), a = l.useRef(/* @__PURE__ */ new Map()), [u, c] = l.useState(null), [d] = l.useState(() => il({
    compositions: r.map((b, E) => ({
      ...b,
      order: E
    })),
    folders: []
  })), { compositions: m, folders: f } = $n(d.subscribe, d.getSnapshot, d.getSnapshot), [v, h] = l.useState(o), [w, x] = l.useState(null), g = l.useCallback((b) => {
    const E = i.current, k = a.current, P = new Set(d.getSnapshot().compositions.map((_) => _.id)), F = /* @__PURE__ */ new Map();
    for (const _ of b.compositions) {
      const O = `composition:${_.id}`;
      if (F.has(O) || !E.has(O) && P.has(_.id)) {
        c(new Error(`Multiple composition with id ${_.id} are registered.`));
        return;
      }
      F.set(O, _);
    }
    for (const _ of b.folders)
      F.set(`folder:${Eu(_)}`, _);
    const I = new Set(F.keys()), L = new Map(b.orderIds.map((_, O) => [_, O]));
    i.current = I, a.current = F, d.setSnapshot((_) => {
      const O = Ud({
        current: _.compositions,
        entries: b.compositions,
        previousDescriptors: k,
        previousKeys: E,
        nextKeys: I,
        getKey: (j) => `composition:${j.id}`,
        order: L,
        orderProperty: "order"
      }), N = Ud({
        current: _.folders,
        entries: b.folders,
        previousDescriptors: k,
        previousKeys: E,
        nextKeys: I,
        getKey: (j) => `folder:${Eu(j)}`,
        order: L,
        orderProperty: "order"
      });
      return O === _.compositions && N === _.folders ? _ : { compositions: O, folders: N };
    });
  }, [d]);
  l.useImperativeHandle(aS, () => ({
    getCompositions: () => (s.current?.(), d.getSnapshot().compositions)
  }), [d]);
  const p = l.useMemo(() => ({
    setCanvasContent: h,
    setCurrentAssetMetadata: x,
    onlyRenderComposition: t
  }), [t]), y = l.useMemo(() => ({
    compositions: m,
    folders: f,
    currentCompositionMetadata: n,
    currentAssetMetadata: w,
    canvasContent: v
  }), [
    m,
    f,
    n,
    w,
    v
  ]), C = l.useRef(y);
  if (C.current = y, u !== null)
    throw u;
  return /* @__PURE__ */ S.jsx(uS, {
    ref: s,
    onSnapshot: g,
    children: /* @__PURE__ */ S.jsx(Dr.Provider, {
      value: y,
      children: /* @__PURE__ */ S.jsx(Hw.Provider, {
        value: C,
        children: /* @__PURE__ */ S.jsx(ym.Provider, {
          value: p,
          children: e
        })
      })
    })
  });
}, ZI = m0(), Uv = d0, XI = (e, t, n) => new Proxy(e, {
  apply(r, o, i) {
    const s = i[0];
    if (ZI.includes(s)) {
      const [a, u, ...c] = i, d = t === null ? null : i[t], m = u?.[Uv], f = !m && s === zE() && u?.controls ? sl(u.controls) : null;
      let v = m || f;
      if (!v)
        if (d && typeof d.fileName == "string" && typeof d.lineNumber == "number" && typeof d.columnNumber == "number")
          v = f0({
            fileName: n(d.fileName),
            lineNumber: d.lineNumber,
            columnNumber: d.columnNumber - 1
          });
        else {
          const { stackTraceLimit: w } = Error, x = typeof w == "number" && w > 2 && Object.getOwnPropertyDescriptor(Error, "stackTraceLimit")?.writable;
          let g;
          try {
            x && (Error.stackTraceLimit = 2), g = new Error();
          } finally {
            x && (Error.stackTraceLimit = w);
          }
          const p = g.stack;
          if (p) {
            const y = p.indexOf(`
`, p.startsWith(`Error
`) ? 6 : 0), C = y === -1 ? -1 : p.indexOf(`
`, y + 1);
            v = C === -1 ? p : p.slice(0, C);
          } else
            v = p;
        }
      const h = m ? { ...u } : {
        ...u ?? {},
        [Uv]: v
      };
      return Reflect.apply(r, o, [a, h, ...c]);
    }
    return Reflect.apply(r, o, i);
  }
}), Ea = {}, eT = (e) => {
  if (typeof document > "u")
    return () => {
    };
  if (Ea[e])
    return () => {
    };
  const t = document.head || document.getElementsByTagName("head")[0], n = document.createElement("style");
  return n.appendChild(document.createTextNode(e)), t.prepend(n), Ea[e] = n, () => {
    const r = Ea[e];
    r && (r.parentNode && r.parentNode.removeChild(r), delete Ea[e]);
  };
}, gs = "__remotion_objectfitcontain", tT = (e, t) => e ? `
    ${e} * {
      box-sizing: border-box;
    }
    ${e} *:-webkit-full-screen {
      width: 100%;
      height: 100%;
    }
    ${e} .${gs} {
      object-fit: contain;
    }
  ` : `
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
	    background-color: ${t};
    }
    .${gs} {
      object-fit: contain;
    }
    `, nT = (e, t) => {
  const n = e.slice(1).map((o, i) => Math.hypot(o[0] - e[i][0], o[1] - e[i][1])), r = e.map(() => [0, 0]);
  if (t === "smooth" && e.length > 2) {
    for (let o = 0; o < 2; o++) {
      const i = n.map((u, c) => (e[c + 1][o] - e[c][o]) / u), s = new Array(e.length).fill(0), a = new Array(e.length).fill(0);
      for (let u = 1; u < e.length - 1; u++) {
        const c = 2 * (n[u - 1] + n[u]) - n[u - 1] * a[u - 1];
        a[u] = n[u] / c, s[u] = (6 * (i[u] - i[u - 1]) - n[u - 1] * s[u - 1]) / c;
      }
      for (let u = e.length - 2; u > 0; u--)
        s[u] -= a[u] * s[u + 1];
      for (let u = 0; u < e.length; u++)
        r[u][o] = u === 0 ? i[0] - n[0] * s[1] / 6 : i[u - 1] + n[u - 1] * (s[u - 1] + 2 * s[u]) / 6;
    }
    for (let o = 0; o < e.length; o++) {
      const i = 3 * Math.min(o === 0 ? 1 / 0 : (e[o][0] - e[o - 1][0]) / n[o - 1], o === e.length - 1 ? 1 / 0 : (e[o + 1][0] - e[o][0]) / n[o]);
      r[o][0] > i && (r[o][1] *= i / r[o][0]), r[o][0] = Math.max(0, Math.min(i, r[o][0]));
    }
  }
  return (o) => {
    if (o <= e[0][0])
      return e[0][1];
    if (o >= e[e.length - 1][0])
      return e[e.length - 1][1];
    const i = e.findIndex((p) => p[0] > o) - 1, s = e[i], a = e[i + 1];
    if (o === s[0])
      return s[1];
    if (t === "linear" || e.length === 2)
      return s[1] + (a[1] - s[1]) * ((o - s[0]) / (a[0] - s[0]));
    const u = n[i] / 3, c = s[0] + u * r[i][0], d = a[0] - u * r[i + 1][0];
    let m = 0, f = 1;
    for (let p = 0; p < 32; p++) {
      const y = (m + f) / 2, C = 1 - y;
      C ** 3 * s[0] + 3 * C ** 2 * y * c + 3 * C * y ** 2 * d + y ** 3 * a[0] < o ? m = y : f = y;
    }
    const v = (m + f) / 2, h = 1 - v, w = s[1] + u * r[i][1], x = a[1] - u * r[i + 1][1], g = h ** 3 * s[1] + 3 * h ** 2 * v * w + 3 * h * v ** 2 * x + v ** 3 * a[1];
    return Math.max(0, Math.min(1, g));
  };
}, lS = "__remotion-studio-container", rT = () => document.getElementById(lS), oT = D.createContext(null), Rc = (e) => {
  e.disposed || (e.disposed = !0, e.values.clear(), e.dispose());
}, cS = () => {
  const e = /* @__PURE__ */ new Map();
  let t = !1;
  return {
    acquire: ({
      key: n,
      create: r
    }) => {
      if (t)
        throw new Error("Media resource manager has already been disposed");
      let o = e.get(n);
      if (!o) {
        const s = r();
        o = {
          resource: s.resource,
          dispose: s.dispose,
          refCount: 0,
          disposeGeneration: 0,
          disposed: !1,
          values: /* @__PURE__ */ new Map()
        }, e.set(n, o);
      }
      o.refCount++, o.disposeGeneration++;
      let i = !1;
      return {
        resource: o.resource,
        getOrCreateValue: (s, a) => {
          if (o.values.has(s))
            return o.values.get(s);
          const u = a();
          return o.values.set(s, u), u;
        },
        release: () => {
          if (i || (i = !0, o.refCount--, o.refCount !== 0))
            return;
          const s = ++o.disposeGeneration;
          queueMicrotask(() => {
            o.refCount !== 0 || o.disposeGeneration !== s || (e.get(n) === o && e.delete(n), Rc(o));
          });
        }
      };
    },
    invalidate: (n) => {
      const r = e.get(n);
      r && (e.delete(n), r.disposeGeneration++, r.refCount === 0 && Rc(r));
    },
    dispose: () => {
      if (t)
        return;
      t = !0;
      const n = Array.from(e.values());
      e.clear();
      let r = null;
      for (const o of n)
        try {
          Rc(o);
        } catch (i) {
          r ?? (r = i);
        }
      if (r !== null)
        throw r;
    }
  };
}, iT = ({
  src: e,
  credentials: t,
  requestInitFingerprint: n,
  revision: r
}) => JSON.stringify([
  "mediabunny-input",
  e,
  t,
  n,
  r
]), sT = "mediabunny-duration", aT = cS(), uT = l.createContext(!1), lT = "remotion-react-refresh-started", cT = "remotion-react-refresh-finished", dT = null, Fc = [], fT = () => dT, mT = (e) => (Fc.push(e), () => {
  Fc = Fc.filter((t) => t !== e);
}), pT = ({
  children: e,
  numberOfAudioTags: t,
  logLevel: n,
  audioLatencyHint: r,
  previewSampleRate: o,
  videoEnabled: i,
  audioEnabled: s,
  frameState: a,
  _experimentalKeepAudioContextAlive: u
}) => {
  const c = l.useMemo(() => ({ logLevel: n, mountTime: Date.now() }), [n]);
  return /* @__PURE__ */ S.jsx(Br.Provider, {
    value: c,
    children: /* @__PURE__ */ S.jsx(GE, {
      frameState: a,
      children: /* @__PURE__ */ S.jsx(tI, {
        videoEnabled: i,
        audioEnabled: s,
        children: /* @__PURE__ */ S.jsx(Xw, {
          children: /* @__PURE__ */ S.jsx(R1, {
            children: /* @__PURE__ */ S.jsx(W0, {
              children: /* @__PURE__ */ S.jsx(N1, {
                children: /* @__PURE__ */ S.jsx(V1, {
                  children: /* @__PURE__ */ S.jsx($1, {
                    audioLatencyHint: r,
                    audioEnabled: s,
                    previewSampleRate: o,
                    _experimentalKeepAudioContextAlive: u,
                    children: /* @__PURE__ */ S.jsx(_1, {
                      numberOfAudioTags: t,
                      children: /* @__PURE__ */ S.jsx(e0, {
                        children: e
                      })
                    })
                  })
                })
              })
            })
          })
        })
      })
    })
  });
}, hT = () => {
  const e = /* @__PURE__ */ new Map();
  let t = !1;
  return {
    getOrCreateResource: ({
      key: n,
      create: r
    }) => {
      if (t)
        throw new Error("Render resource manager has already been disposed");
      const o = e.get(n);
      if (o)
        return o.resource;
      const i = r();
      return e.set(n, i), i.resource;
    },
    dispose: () => {
      if (t)
        return;
      t = !0;
      const n = Array.from(e.values());
      e.clear();
      let r = null;
      for (const o of n)
        try {
          o.dispose();
        } catch (i) {
          r ?? (r = i);
        }
      if (r !== null)
        throw r;
    }
  };
}, vT = D.createContext(null), Wv = [
  "h264",
  "h265",
  "vp8",
  "vp9",
  "av1",
  "mp3",
  "aac",
  "wav",
  "prores",
  "h264-mkv",
  "h264-ts",
  "gif"
];
function gT(e, t, n) {
  if (!(typeof e > "u")) {
    if (typeof e != "string")
      throw new TypeError(`The "${n}" prop ${t} must be a string, but you passed a value of type ${typeof e}.`);
    if (!Wv.includes(e))
      throw new Error(`The "${n}" prop ${t} must be one of ${Wv.join(", ")}, but you passed ${e}.`);
  }
}
var yT = ({
  calculated: e,
  compositionId: t,
  compositionFps: n,
  compositionHeight: r,
  compositionWidth: o,
  compositionDurationInFrames: i
}) => {
  const s = `calculated by calculateMetadata() for the composition "${t}"`, a = `of the "<Composition />" component with the id "${t}"`, u = e?.width ?? o ?? void 0;
  Ko(u, "width", e?.width ? s : a);
  const c = e?.height ?? r ?? void 0;
  Ko(c, "height", e?.height ? s : a);
  const d = e?.fps ?? n ?? null;
  el(d, e?.fps ? s : a);
  const m = e?.durationInFrames ?? i ?? null;
  Vr(m, {
    allowFloats: !1,
    component: `of the "<Composition />" component with the id "${t}"`
  });
  const f = e?.defaultCodec;
  gT(f, s, "defaultCodec");
  const v = e?.defaultOutName, h = e?.defaultVideoImageFormat, w = e?.defaultPixelFormat, x = e?.defaultProResProfile, g = e?.defaultSampleRate;
  return {
    width: u,
    height: c,
    fps: d,
    durationInFrames: m,
    defaultCodec: f,
    defaultOutName: v,
    defaultVideoImageFormat: h,
    defaultPixelFormat: w,
    defaultProResProfile: x,
    defaultSampleRate: g
  };
}, qv = ({
  calculated: e,
  compositionDurationInFrames: t,
  compositionFps: n,
  compositionHeight: r,
  compositionId: o,
  compositionWidth: i,
  defaultProps: s,
  originalProps: a
}) => {
  const u = yT({
    calculated: e,
    compositionDurationInFrames: t,
    compositionFps: n,
    compositionHeight: r,
    compositionWidth: i,
    compositionId: o
  });
  return {
    metadataSource: {
      durationInFrames: e?.durationInFrames === void 0 ? "composition" : "calculate-metadata",
      fps: e?.fps === void 0 ? "composition" : "calculate-metadata",
      height: e?.height === void 0 ? "composition" : "calculate-metadata",
      width: e?.width === void 0 ? "composition" : "calculate-metadata"
    },
    videoConfig: {
      ...u,
      id: o,
      defaultProps: Dd(s ?? {}),
      props: Dd(e?.props ?? a),
      defaultCodec: u.defaultCodec ?? null,
      defaultOutName: u.defaultOutName ?? null,
      defaultVideoImageFormat: u.defaultVideoImageFormat ?? null,
      defaultPixelFormat: u.defaultPixelFormat ?? null,
      defaultProResProfile: u.defaultProResProfile ?? null,
      defaultSampleRate: u.defaultSampleRate ?? null
    }
  };
}, dS = ({
  calculateMetadata: e,
  signal: t,
  defaultProps: n,
  inputProps: r,
  compositionId: o,
  compositionDurationInFrames: i,
  compositionFps: s,
  compositionHeight: a,
  compositionWidth: u
}) => {
  const c = e ? e({
    defaultProps: n,
    props: r,
    abortSignal: t,
    compositionId: o,
    isRendering: ln().isRendering
  }) : null;
  return c !== null && typeof c == "object" && "then" in c ? c.then((d) => qv({
    calculated: d,
    compositionDurationInFrames: i,
    compositionFps: s,
    compositionHeight: a,
    compositionWidth: u,
    compositionId: o,
    defaultProps: n,
    originalProps: r
  })) : qv({
    calculated: c,
    compositionDurationInFrames: i,
    compositionFps: s,
    compositionHeight: a,
    compositionWidth: u,
    compositionId: o,
    defaultProps: n,
    originalProps: r
  });
}, fS = (e) => {
  const t = dS(e);
  return typeof t == "object" && "then" in t ? t.then(({ videoConfig: n }) => n) : t.videoConfig;
}, wT = (e) => {
  try {
    return {
      type: "success",
      result: dS(e)
    };
  } catch (t) {
    return {
      type: "error",
      error: t
    };
  }
}, ST = (e) => {
  try {
    return {
      type: "success",
      result: fS(e)
    };
  } catch (t) {
    return {
      type: "error",
      error: t
    };
  }
}, xT = D.createContext(() => {
}), CT = () => {
  if (ln().isRendering) {
    const e = window.remotion_envVariables;
    return e ? { ...JSON.parse(e), NODE_ENV: "production" } : {};
  }
  return {
    NODE_ENV: "production"
  };
}, bT = () => {
  const e = CT();
  window.process || (window.process = {}), window.process.env || (window.process.env = {}), Object.keys(e).forEach((t) => {
    window.process.env[t] = e[t];
  });
}, {
  freeze: hF,
  layout: vF,
  ...ET
} = _r, kT = {
  ...ET,
  ...Lm
}, gp = ({
  name: e = "Track",
  children: t,
  layout: n = "none",
  ...r
}) => {
  const [o] = l.useState(() => String(Math.random())), i = l.useMemo(() => ({ id: o, name: e }), [o, e]);
  return /* @__PURE__ */ S.jsx(Ar.Provider, {
    value: i,
    children: /* @__PURE__ */ S.jsx(bl, {
      _remotionInternalDocumentationLink: "https://www.remotion.dev/docs/track",
      ...r,
      name: e,
      layout: n,
      _remotionInternalTimelineTrack: { role: "track", seriesOffset: null },
      children: t
    })
  });
}, PT = $t({
  Component: (e) => /* @__PURE__ */ S.jsx(gp, {
    ...e,
    layout: "none"
  }),
  componentName: "<Track>",
  componentIdentity: "dev.remotion.remotion.Track",
  schema: kT,
  supportsEffects: !1
});
Le(PT);
var IT = D.createContext(null), TT = ({
  src: e,
  transparent: t,
  currentTime: n,
  toneMapped: r
}) => `http://localhost:${window.remotion_proxyPort}/proxy?src=${encodeURIComponent(pn(e))}&time=${encodeURIComponent(Math.max(0, n))}&transparent=${String(t)}&toneMapped=${String(r)}`, RT = ({
  onError: e,
  volume: t,
  playbackRate: n,
  src: r,
  muted: o,
  allowAmplificationDuringRender: i,
  transparent: s,
  toneMapped: a,
  toneFrequency: u,
  name: c,
  loopVolumeCurveBehavior: d,
  delayRenderRetries: m,
  delayRenderTimeoutInMilliseconds: f,
  onVideoFrame: v,
  crossOrigin: h,
  audioStreamIndex: w,
  preservePitch: x,
  ...g
}) => {
  const p = Hr(), y = hn(), C = ti(d), b = zr(), E = l.useContext(ge), k = E?.playbackRate ?? 1, P = l.useContext(hr), { registerRenderAsset: F, unregisterRenderAsset: I } = l.useContext(Gr);
  if (!r)
    throw new TypeError("No `src` was passed to <OffthreadVideo>.");
  const L = l.useMemo(() => `offthreadvideo-${js(r)}-${E?.cumulatedFrom}-${E?.relativeFrom}-${E?.durationInFrames}`, [
    r,
    E?.cumulatedFrom,
    E?.relativeFrom,
    E?.durationInFrames
  ]), _ = ni({
    volume: t,
    frame: C,
    mediaVolume: 1
  });
  ri(_);
  const O = $l(), { shouldUseAudio: N } = oi({
    muted: o,
    volume: _,
    audioEnabled: O
  });
  if (!b)
    throw new Error("No video config found");
  l.useEffect(() => {
    if (!r)
      throw new Error("No src passed");
    if (N)
      return F({
        type: "video",
        src: pn(r),
        id: L,
        frame: p,
        volume: _,
        mediaFrame: P + (y - P) / k,
        playbackRate: n * k,
        toneFrequency: u,
        audioStartFrame: P,
        audioStreamIndex: w,
        preservePitch: x ?? !0
      }), () => I(L);
  }, [
    N,
    r,
    F,
    L,
    I,
    _,
    y,
    p,
    n,
    u,
    P,
    k,
    w,
    x
  ]);
  const j = l.useMemo(() => z1({
    frame: y,
    playbackRate: n || 1,
    startFrom: P
  }) / b.fps, [y, P, n, b.fps]), V = l.useMemo(() => TT({
    src: r,
    currentTime: j,
    transparent: s,
    toneMapped: a
  }), [a, j, r, s]), [B, A] = l.useState(null), { delayRender: T, continueRender: M, cancelRender: R } = _t();
  l.useLayoutEffect(() => {
    if (!window.remotion_videoEnabled)
      return;
    const H = [];
    A(null);
    const U = new AbortController(), K = T(`Fetching ${V} from server`, {
      retries: m ?? void 0,
      timeoutInMilliseconds: f ?? void 0
    });
    return (async () => {
      try {
        const X = await fetch(V, {
          signal: U.signal,
          cache: "no-store"
        });
        if (X.status !== 200) {
          if (X.status === 500) {
            const Z = await X.json();
            if (Z.error) {
              const le = Z.error.replace(/^Error: /, "");
              throw new Error(le);
            }
          }
          throw new Error(`Server returned status ${X.status} while fetching ${V}`);
        }
        const J = await X.blob(), oe = URL.createObjectURL(J);
        H.push(() => URL.revokeObjectURL(oe)), A({
          src: oe,
          handle: K
        });
      } catch (X) {
        if (X.message.includes("aborted")) {
          M(K);
          return;
        }
        if (U.signal.aborted) {
          M(K);
          return;
        }
        X.message.includes("Failed to fetch") && (X = new Error(`Failed to fetch ${V}. This could be caused by Chrome rejecting the request because the disk space is low. Consider increasing the disk size of your environment.`, { cause: X })), e ? e(X) : R(X);
      }
    })(), H.push(() => {
      U.signal.aborted || U.abort();
    }), () => {
      H.forEach((X) => X());
    };
  }, [
    V,
    m,
    f,
    e,
    M,
    R,
    T
  ]);
  const $ = l.useCallback(() => {
    e ? e?.(new Error("Failed to load image with src " + B)) : R("Failed to load image with src " + B);
  }, [B, e, R]), z = l.useMemo(() => [gs, g.className].filter(Zo).join(" "), [g.className]), q = l.useCallback((H) => {
    v && v(H);
  }, [v]);
  return !B || !window.remotion_videoEnabled ? null : (M(B.handle), /* @__PURE__ */ S.jsx(rS, {
    src: B.src,
    delayRenderRetries: m,
    delayRenderTimeoutInMilliseconds: f,
    onImageFrame: q,
    ...g,
    onError: $,
    className: z
  }));
}, mS = ({
  ref: e,
  onVideoFrame: t
}) => {
  l.useEffect(() => {
    const { current: n } = e;
    if (!n || !t)
      return;
    let r = 0;
    const o = (i, s) => {
      e.current && (t(e.current, i, s), r = e.current.requestVideoFrameCallback(o));
    };
    if (t(n), !!n.requestVideoFrameCallback)
      return r = n.requestVideoFrameCallback(o), () => {
        r && n.cancelVideoFrameCallback(r);
      };
  }, [t, e]);
};
class Po extends Error {
  constructor({ message: n, src: r }) {
    super(n);
    ue(this, "src");
    this.name = "MediaPlaybackError", this.src = r;
  }
}
var FT = (e, t) => {
  const n = l.useContext(ei);
  if (!n)
    throw new Error("SharedAudioContext not found");
  const r = l.useRef(null), o = l.useMemo(() => n.audioContext ? op({
    audioContext: n.audioContext,
    ref: r
  }) : null, [n.audioContext]);
  (D.useInsertionEffect ?? D.useLayoutEffect)(() => j1.bind(null, o?.cleanup ?? null), [o]);
  const {
    timelineId: s,
    userPreferredVolume: a,
    isMutedForPlayback: u,
    volume: c,
    muted: d,
    playbackRate: m,
    preservePitch: f,
    onlyWarnForMediaSeekingError: v,
    src: h,
    onDuration: w,
    acceptableTimeShift: x,
    acceptableTimeShiftInSeconds: g,
    toneFrequency: p,
    name: y,
    _remotionInternalNativeLoopPassed: C,
    _remotionInternalStack: b,
    style: E,
    pauseWhenBuffering: k,
    showInTimeline: P,
    loopVolumeCurveBehavior: F,
    onError: I,
    onAutoPlayError: L,
    onVideoFrame: _,
    crossOrigin: O,
    delayRenderRetries: N,
    delayRenderTimeoutInMilliseconds: j,
    allowAmplificationDuringRender: V,
    useWebAudioApi: B,
    audioStreamIndex: A,
    ...T
  } = e, { fps: M, durationInFrames: R } = bt(), $ = l.useContext(ge), z = Yt(), q = ks();
  if (typeof x < "u")
    throw new Error("acceptableTimeShift has been removed. Use acceptableTimeShiftInSeconds instead.");
  ri(a), U1({
    mediaRef: r,
    src: h,
    mediaType: "video",
    playbackRate: e.playbackRate ?? 1,
    preservePitch: f,
    onlyWarnForMediaSeekingError: v,
    acceptableTimeshift: g ?? null,
    isPremounting: !!$?.premounting,
    isPostmounting: !!$?.postmounting,
    pauseWhenBuffering: k,
    onAutoPlayError: L ?? null
  }), W1({
    id: s,
    isPostmounting: !!$?.postmounting,
    isPremounting: !!$?.premounting,
    mediaRef: r,
    mediaType: "video",
    onAutoPlayError: L ?? null
  }), L1({
    logLevel: z,
    mediaRef: r,
    volume: a,
    source: o,
    shouldUseWebAudioApi: B ?? !1
  });
  const H = $ ? $.relativeFrom : 0, U = $ ? Math.min($.durationInFrames, R) : R, K = Yr(h), Q = LP({
    actualSrc: K,
    actualFrom: H,
    duration: U,
    fps: M
  });
  l.useImperativeHandle(t, () => r.current, []), l.useState(() => Ge({
    logLevel: z,
    message: `Mounting video with source = ${Q}, v=${Li}, user agent=${typeof navigator > "u" ? "server" : navigator.userAgent}`,
    tag: "video",
    mountTime: q
  })), l.useEffect(() => {
    const { current: Z } = r;
    if (!Z)
      return;
    const le = () => {
      if (Z.error) {
        if (console.error("Error occurred in video", Z?.error), I) {
          const de = new Po({
            message: `Code ${Z.error.code}: ${Z.error.message}`,
            src: h
          });
          I(de);
          return;
        }
        throw new Po({
          message: `The browser threw an error while playing the video ${h}: Code ${Z.error.code} - ${Z?.error?.message}. See https://remotion.dev/docs/media-playback-error for help. Pass an onError() prop to handle the error.`,
          src: h
        });
      } else {
        if (I) {
          const de = new Po({
            message: `The browser threw an error while playing the video ${h}`,
            src: h
          });
          I(de);
          return;
        }
        throw new Po({
          message: "The browser threw an error while playing the video",
          src: h
        });
      }
    };
    return Z.addEventListener("error", le, { once: !0 }), () => {
      Z.removeEventListener("error", le);
    };
  }, [I, h]), mS({ ref: r, onVideoFrame: _ }), O1(r, w, h, !1), l.useEffect(() => {
    const { current: Z } = r;
    Z && (Ml() ? Z.preload = "metadata" : Z.preload = "auto");
  }, []);
  const X = l.useMemo(() => ({
    ...E
  }), [E]), J = rp({
    crossOrigin: O,
    requestsVideoFrame: !!_,
    isClientSideRendering: !1
  });
  return /* @__PURE__ */ S.jsx("video", {
    ...T,
    ref: r,
    muted: u,
    playsInline: !0,
    src: Q,
    loop: C,
    style: X,
    disableRemotePlayback: !0,
    crossOrigin: J,
    controls: !1
  });
}, MT = l.forwardRef(FT), NT = (e, t) => {
  const {
    volume: n,
    muted: r,
    playbackRate: o,
    src: i,
    name: s,
    _remotionInternalStack: a,
    showInTimeline: u,
    loopVolumeCurveBehavior: c,
    onlyWarnForMediaSeekingError: d
  } = e, [m] = l.useState(() => String(Math.random())), f = l.useContext(ge), { isStudio: v } = ae(), [h] = cp(), w = ti(c ?? "repeat"), x = ni({
    frame: w,
    volume: n,
    mediaVolume: h
  }), { isMutedForTimeline: g, isMutedForPlayback: p } = oi({
    muted: r ?? !1,
    volume: x,
    audioEnabled: !0
  }), y = l.useCallback(() => a ?? null, [a]), { automaticOutlineRef: C, registration: b } = ap({
    mediaType: "video",
    src: i,
    playbackRate: o ?? 1,
    displayName: s ?? null,
    id: m,
    getStack: y,
    showInTimeline: u,
    premountDisplay: f?.premountDisplay ?? null,
    postmountDisplay: f?.postmountDisplay ?? null,
    loopDisplay: void 0,
    documentationLink: d ? "https://www.remotion.dev/docs/offthreadvideo" : "https://www.remotion.dev/docs/html5-video",
    muted: g
  }), E = l.useMemo(() => v || C || b !== null ? {
    type: "sequence",
    id: m,
    value: b,
    outlineChildrenRef: C
  } : null, [C, v, b, m]);
  return /* @__PURE__ */ S.jsx(Qu, {
    value: null,
    _remotionCommitMetadata: E,
    children: /* @__PURE__ */ S.jsx(Wr, {
      children: /* @__PURE__ */ S.jsx(MT, {
        ...e,
        ref: t,
        timelineId: m,
        userPreferredVolume: x,
        isMutedForPlayback: p
      })
    })
  });
}, yp = l.forwardRef(NT), wp = (e) => {
  const {
    startFrom: t,
    endAt: n,
    trimBefore: r,
    trimAfter: o,
    durationInFrames: i,
    name: s,
    pauseWhenBuffering: a,
    _remotionInternalStack: u,
    showInTimeline: c,
    ...d
  } = e, m = ae(), f = Ps(a);
  if (m.isClientSideRendering)
    throw new Error("<OffthreadVideo> is not supported in @remotion/web-renderer. Use <Video> from @remotion/media instead. See https://remotion.dev/docs/client-side-rendering/limitations");
  const v = l.useCallback(() => {
  }, []);
  if (typeof e.src != "string")
    throw new TypeError(`The \`<OffthreadVideo>\` tag requires a string for \`src\`, but got ${JSON.stringify(e.src)} instead.`);
  Tl({ startFrom: t, endAt: n, trimBefore: r, trimAfter: o }), i !== void 0 && Vr(i, {
    component: "of the <OffthreadVideo /> component",
    allowFloats: !0
  });
  const { trimBeforeValue: h, trimAfterValue: w } = Rl({
    startFrom: t,
    endAt: n,
    trimBefore: r,
    trimAfter: o
  }), x = tp({
    durationInFrames: i,
    trimAfter: w,
    trimBefore: h
  });
  if (typeof h < "u" || typeof x < "u")
    return /* @__PURE__ */ S.jsx(hr.Provider, {
      value: h ?? 0,
      children: /* @__PURE__ */ S.jsx(mt, {
        layout: "none",
        from: 0 - (h ?? 0),
        showInTimeline: !1,
        durationInFrames: x === void 0 ? void 0 : (h ?? 0) + (x - (h ?? 0)) / (e.playbackRate ?? 1),
        name: s,
        children: /* @__PURE__ */ S.jsx(wp, {
          pauseWhenBuffering: f,
          ...d,
          trimAfter: void 0,
          durationInFrames: void 0,
          name: void 0,
          showInTimeline: c,
          trimBefore: void 0,
          _remotionInternalStack: void 0,
          startFrom: void 0,
          endAt: void 0
        })
      })
    });
  if (Il(e, "Video"), m.isRendering)
    return /* @__PURE__ */ S.jsx(RT, {
      pauseWhenBuffering: f,
      ...d,
      trimAfter: void 0,
      durationInFrames: void 0,
      name: void 0,
      showInTimeline: c,
      trimBefore: void 0,
      _remotionInternalStack: void 0,
      startFrom: void 0,
      endAt: void 0
    });
  const {
    transparent: g,
    toneMapped: p,
    onAutoPlayError: y,
    onVideoFrame: C,
    crossOrigin: b,
    delayRenderRetries: E,
    delayRenderTimeoutInMilliseconds: k,
    ...P
  } = d;
  return /* @__PURE__ */ S.jsx(yp, {
    _remotionInternalStack: u ?? null,
    onDuration: v,
    onlyWarnForMediaSeekingError: !0,
    pauseWhenBuffering: f,
    showInTimeline: c ?? !0,
    onAutoPlayError: y ?? void 0,
    onVideoFrame: C ?? null,
    crossOrigin: b,
    ...P,
    _remotionInternalNativeLoopPassed: !1
  });
}, $T = ({
  src: e,
  acceptableTimeShiftInSeconds: t,
  allowAmplificationDuringRender: n,
  audioStreamIndex: r,
  crossOrigin: o,
  delayRenderRetries: i,
  delayRenderTimeoutInMilliseconds: s,
  loopVolumeCurveBehavior: a,
  muted: u,
  name: c,
  onAutoPlayError: d,
  onError: m,
  onVideoFrame: f,
  pauseWhenBuffering: v,
  playbackRate: h,
  preservePitch: w,
  showInTimeline: x,
  style: g,
  toneFrequency: p,
  toneMapped: y,
  transparent: C,
  trimAfter: b,
  durationInFrames: E,
  trimBefore: k,
  useWebAudioApi: P,
  volume: F,
  _remotionInternalNativeLoopPassed: I,
  endAt: L,
  _remotionInternalStack: _,
  startFrom: O,
  imageFormat: N,
  ...j
}) => {
  if (N)
    throw new TypeError("The `<OffthreadVideo>` tag does no longer accept `imageFormat`. Use the `transparent` prop if you want to render a transparent video.");
  return /* @__PURE__ */ S.jsx(wp, {
    acceptableTimeShiftInSeconds: t,
    allowAmplificationDuringRender: n ?? !0,
    audioStreamIndex: r ?? 0,
    crossOrigin: o,
    delayRenderRetries: i,
    delayRenderTimeoutInMilliseconds: s,
    loopVolumeCurveBehavior: a ?? "repeat",
    muted: u ?? !1,
    name: c,
    onAutoPlayError: d ?? null,
    onError: m,
    onVideoFrame: f,
    pauseWhenBuffering: Ps(v),
    playbackRate: h ?? 1,
    preservePitch: w,
    toneFrequency: p ?? 1,
    showInTimeline: x ?? !0,
    src: e,
    _remotionInternalStack: _,
    startFrom: O,
    _remotionInternalNativeLoopPassed: I ?? !1,
    endAt: L,
    style: g,
    toneMapped: y ?? !0,
    transparent: C ?? !1,
    trimAfter: b,
    durationInFrames: E,
    trimBefore: k,
    useWebAudioApi: P ?? !1,
    volume: F,
    ...j
  });
};
Le($T);
var _T = "remotion_staticFilesChanged";
function AT() {
  const e = D.useContext(Dr), t = D.useContext(nl), n = D.useContext(mn), r = D.useContext(Qt), o = D.useContext(ge), i = D.useContext(Ur), s = D.useContext(Ar), a = D.useContext(fr), u = D.useContext(Pl), c = D.useContext(tl), d = D.useContext(Gr), m = D.useContext(mr), f = D.useContext(yl), v = D.useContext(Ms), h = D.useContext(zm), w = D.useContext(Xo), x = D.useContext(wl), g = D.useContext(Xu), p = D.useContext(Sl), y = D.useContext(Ds), C = D.useContext(Br);
  return l.useMemo(() => ({
    compositionManagerCtx: e,
    videoContext: t,
    timelineContext: n,
    setTimelineContext: r,
    sequenceContext: o,
    defaultPremountInSeconds: i,
    timelineTrackContext: s,
    canUseRemotionHooksContext: a,
    preloadContext: u,
    resolveCompositionContext: c,
    renderAssetManagerContext: d,
    sequenceManagerActionsContext: m,
    sequenceManagerRefContext: f,
    sequenceRegistryContext: v,
    sequenceRegistryScopeContext: h,
    sequenceRegistrationContext: w,
    disableSequenceRegistrationContext: x,
    remotionEnvironmentContext: g,
    visualModePropStatusesRefContext: p,
    bufferManagerContext: y,
    logLevelContext: C
  }), [
    e,
    t,
    o,
    i,
    s,
    r,
    n,
    a,
    u,
    c,
    d,
    m,
    f,
    v,
    h,
    w,
    x,
    g,
    p,
    y,
    C
  ]);
}
var LT = jr(zm.Provider), OT = ({
  contexts: e,
  children: t
}) => {
  const [n] = l.useState(() => String(Math.random())), [r, o] = l.useState(pm), i = l.useRef(!1), s = l.useRef(!1), a = l.useRef(!1), u = l.useRef(0), c = e.sequenceRegistryContext, d = e.sequenceRegistryScopeContext, m = l.useRef(c), f = d?.commitRegistrationRequested === !0 && c !== null && r, v = l.useCallback((x, g) => {
    s.current && g.length > 0 || (i.current = !0, d?.onCommitSequences(n, x, g));
  }, [d, n]);
  (typeof window > "u" ? D.useEffect : D.useLayoutEffect)(() => {
    if (d === null || typeof window > "u")
      return;
    const x = ++u.current;
    a.current = !1, m.current = c;
    const g = () => {
      s.current || (s.current = !0, queueMicrotask(() => {
        d.onCommitSequences(n, [], []), queueMicrotask(() => {
          a.current || o(!1);
        });
      }));
    };
    return window.addEventListener($r, g), f && queueMicrotask(() => {
      u.current === x && !a.current && !i.current && g();
    }), () => {
      a.current = !0, window.removeEventListener($r, g), queueMicrotask(() => {
        (m.current !== c || u.current === x && a.current) && d.onCommitSequences(n, [], []);
      });
    };
  }, [d, n, c, f]);
  const w = l.useMemo(() => ({
    type: "sequence-manager",
    id: n,
    onCommit: f ? v : null
  }), [f, v, n]);
  return /* @__PURE__ */ S.jsx(LT, {
    value: d,
    _remotionCommitMetadata: w,
    children: /* @__PURE__ */ S.jsx(mr.Provider, {
      value: e.sequenceManagerActionsContext,
      children: /* @__PURE__ */ S.jsx(Ms.Provider, {
        value: c,
        children: /* @__PURE__ */ S.jsx(gl.Provider, {
          value: f,
          children: t
        })
      })
    })
  });
}, jT = (e) => {
  const { children: t, contexts: n } = e;
  return /* @__PURE__ */ S.jsx(Br.Provider, {
    value: n.logLevelContext,
    children: /* @__PURE__ */ S.jsx(fr.Provider, {
      value: n.canUseRemotionHooksContext,
      children: /* @__PURE__ */ S.jsx(Pl.Provider, {
        value: n.preloadContext,
        children: /* @__PURE__ */ S.jsx(Dr.Provider, {
          value: n.compositionManagerCtx,
          children: /* @__PURE__ */ S.jsx(yl.Provider, {
            value: n.sequenceManagerRefContext,
            children: /* @__PURE__ */ S.jsx(Xu.Provider, {
              value: n.remotionEnvironmentContext,
              children: /* @__PURE__ */ S.jsx(Xo.Provider, {
                value: n.sequenceRegistrationContext,
                children: /* @__PURE__ */ S.jsx(wl.Provider, {
                  value: n.disableSequenceRegistrationContext,
                  children: /* @__PURE__ */ S.jsx(OT, {
                    contexts: n,
                    children: /* @__PURE__ */ S.jsx(Sl.Provider, {
                      value: n.visualModePropStatusesRefContext,
                      children: /* @__PURE__ */ S.jsx(Gr.Provider, {
                        value: n.renderAssetManagerContext,
                        children: /* @__PURE__ */ S.jsx(tl.Provider, {
                          value: n.resolveCompositionContext,
                          children: /* @__PURE__ */ S.jsx(mn.Provider, {
                            value: n.timelineContext,
                            children: /* @__PURE__ */ S.jsx(Qt.Provider, {
                              value: n.setTimelineContext,
                              children: /* @__PURE__ */ S.jsx(ge.Provider, {
                                value: n.sequenceContext,
                                children: /* @__PURE__ */ S.jsx(Ds.Provider, {
                                  value: n.bufferManagerContext,
                                  children: /* @__PURE__ */ S.jsx(Ar.Provider, {
                                    value: n.timelineTrackContext,
                                    children: /* @__PURE__ */ S.jsx(Ur.Provider, {
                                      value: n.defaultPremountInSeconds,
                                      children: /* @__PURE__ */ S.jsx(nl.Provider, {
                                        value: n.videoContext,
                                        children: t
                                      })
                                    })
                                  })
                                })
                              })
                            })
                          })
                        })
                      })
                    })
                  })
                })
              })
            })
          })
        })
      })
    })
  });
}, DT = l.createRef(), G = {
  HtmlInCanvasFallback: G1,
  useHtmlInCanvasUnsupportedMessage: Z1,
  OptimisticSequenceDeletion: Ru,
  usePendingSequenceDeletions: Zm,
  createElementSourceProxy: XI,
  CommittedMetadataProvider: Qu,
  withCommittedMetadata: jr,
  DefaultPremountContext: Ur,
  evaluateSourceNumericValue: br,
  evaluateSourcePropStatuses: qm,
  AbsoluteFillElement: bs,
  MaxMediaCacheSizeContext: oT,
  getMediabunnyInputResourceKey: iT,
  globalMediaResourceManager: aT,
  makeMediaResourceManager: cS,
  MEDIABUNNY_DURATION_VALUE_KEY: sT,
  makeRenderResourceManager: hT,
  RenderResourceManagerContext: vT,
  createRuntimeValueStore: ps,
  useUnsafeVideoConfig: zr,
  useFrameForVolumeProp: ti,
  useTimelinePosition: Hr,
  useAbsoluteTimelinePosition: w0,
  useIsInsideFreeze: Nm,
  useIsInsideNonPremountFreeze: $m,
  useMediaAudioState: oi,
  evaluateVolume: ni,
  getAbsoluteSrc: pn,
  getAnimatedImageDurationInSeconds: C1,
  getAssetDisplayName: sp,
  Timeline: Ad,
  validateMediaTrimProps: Tl,
  validateMediaProps: Il,
  resolveTrimProps: Rl,
  VideoForPreview: yp,
  CompositionManager: Dr,
  CompositionManagerRefContext: Hw,
  CompositionSetters: ym,
  VisualModePropStatusesContext: L0,
  VisualModePropStatusesRefContext: Sl,
  VisualModePropStatusesSubscriptionContext: Um,
  VisualModeBatchSettersContext: U0,
  VisualModeDragOverridesContext: j0,
  VisualModeDragOverridesRefContext: D0,
  VisualModeSettersContext: B0,
  SequenceManagerProvider: W0,
  SequenceManagerRefContext: yl,
  SequenceRegistryContext: Ms,
  useActiveFromDragOverrideKeys: Pk,
  useDragOverridesForNodePath: V0,
  useSequenceManagerSequences: gk,
  SequenceRegistrationContext: Xo,
  DisableSequenceRegistrationProvider: yk,
  CommittedMetadataInternals: jb,
  SequenceOutlineInternals: Vm,
  SequenceOutlineContext: Dm,
  SequenceStackTracesUpdateContext: xT,
  baseSchema: jn,
  sequenceSchema: _r,
  sequenceTimingSchema: Lm,
  SequenceContent: Wr,
  DEFAULT_SEQUENCE_ACTIVITY_LIMIT: Is,
  SequenceActivitySettingsContext: ul,
  SequenceWithoutSchema: bl,
  sequenceStyleSchema: k0,
  sequenceVisualStyleSchema: ZE,
  sequencePremountSchema: b0,
  sequenceCropSchema: E0,
  textSchema: Rs,
  transformSchema: At,
  premountSchema: Jt,
  flattenActiveSchema: Qm,
  getFlatSchemaWithAllKeys: Jm,
  RemotionRootContexts: pT,
  CompositionManagerProvider: JI,
  CompositionRegistryProvider: uS,
  useVideo: rl,
  VideoProvider: e0,
  getRoot: fT,
  useMediaVolumeState: cp,
  usePlayerMutedState: q1,
  useMediaInTimeline: ap,
  useLazyComponent: s0,
  truthy: Zo,
  SequenceContext: ge,
  TimelineTrackContext: Ar,
  TrackWithoutSchema: gp,
  PremountContext: q0,
  usePremounting: gn,
  resolveSequenceDuration: Zt,
  useRemotionContexts: AT,
  RemotionContextProvider: jT,
  CSSUtils: Ow,
  setupEnvVariables: bT,
  MediaVolumeContext: up,
  SetMediaVolumeContext: lp,
  getRemotionEnvironment: ln,
  SharedAudioContext: ei,
  SharedAudioContextProvider: $1,
  SharedAudioTagsContext: Fl,
  SharedAudioTagsContextProvider: _1,
  getAudioSyncAnchorTolerance: YI,
  invalidCompositionErrorMessage: LE,
  invalidFolderNameErrorMessage: qb,
  calculateMediaDuration: El,
  isCompositionIdValid: u0,
  isFolderNameValid: Gw,
  getPreviewDomElement: rT,
  compositionsRef: aS,
  portalNode: zd,
  setPortalNodeCurrentScale: Xb,
  waitForRoot: mT,
  SetTimelineContext: Qt,
  CanUseRemotionHooksProvider: Ld,
  CanUseRemotionHooks: fr,
  DisableInteractivityProvider: L2,
  EnableInteractivityProvider: O2,
  PrefetchProvider: R1,
  DurationsContextProvider: N1,
  IsPlayerContextProvider: Qb,
  useIsPlayer: Sm,
  EditorPropsProvider: Xw,
  EditorPropsContext: xm,
  usePreload: Yr,
  resolveVideoConfig: fS,
  resolveVideoConfigOrCatch: ST,
  resolveVideoConfigWithMetadataOrCatch: wT,
  ResolveCompositionContext: tl,
  useResolvedVideoConfig: Cm,
  resolveCompositionsRef: oE,
  REMOTION_STUDIO_CONTAINER_ELEMENT: lS,
  RenderAssetManager: Gr,
  persistCurrentFrame: h0,
  usePlaybackRate: Fm,
  useTimelineContext: qr,
  useTimelineSetFrameWithoutSeek: S0,
  isIosSafari: Ml,
  WATCH_REMOTION_STATIC_FILES: _T,
  REACT_REFRESH_STARTED_EVENT: lT,
  REACT_REFRESH_FINISHED_EVENT: cT,
  addSequenceStackTraces: Le,
  useMediaStartsAt: ip,
  BufferingProvider: V1,
  BufferingContextReact: Ds,
  getComponentsToAddStacksTo: m0,
  getSingleChildComponent: gm,
  getStackForControls: sl,
  makeOriginalSourceStack: f0,
  parseOriginalSourceStack: WE,
  REMOTION_INTERNAL_STACK_PROP: d0,
  setComponentIdentityResolver: zb,
  CurrentScaleContext: t0,
  PixelDensityContext: IT,
  PreviewSizeContext: n0,
  calculateScale: aE,
  validateRenderAsset: I1,
  Log: Te,
  LogLevelContext: Br,
  useLogLevel: Yt,
  playbackLogging: Ge,
  timeValueRef: rE,
  compositionSelectorRef: DT,
  RemotionEnvironmentContext: Xu,
  warnAboutTooHighVolume: ri,
  AudioForPreview: H1,
  OBJECTFIT_CONTAIN_CLASS_NAME: gs,
  InnerOffthreadVideo: wp,
  useBasicMediaInTimeline: D1,
  getInputPropsOverride: Zw,
  setInputPropsOverride: eE,
  useVideoEnabled: eI,
  useAudioEnabled: $l,
  useBuffering: Im,
  TimelinePosition: Ad,
  useTimelineSeek: p0,
  DelayRenderContextType: i0,
  TimelineContext: mn,
  usePlaying: Pm,
  PlaybackPitchContext: uT,
  PlaybackRateContext: km,
  AbsoluteTimeContext: hs,
  RenderAssetManagerProvider: vP,
  getEffectiveVisualModeValue: i1,
  CompositionRenderErrorContext: Uw,
  useEffectChainState: Os,
  createEffectChainState: S1,
  cleanupEffectChainState: nf,
  runEffectChain: Ls,
  useMemoizedEffects: As,
  subscribeToEffectSource: y2,
  useMemoizedEffectDefinitions: _s,
  createEffect: mP,
  createCurveSampler: nT,
  createWebGLContextError: Z2,
  createWebGL2ContextError: w1,
  computeEffectiveSchemaValuesDotNotation: d1,
  interpolateKeyframedStatus: $s,
  prepareNumericKeyframedStatus: h2,
  setInterpolatePaths: p2,
  makeStaticDragOverride: R2,
  makeKeyframedDragOverride: F2,
  resolveDragOverrideValue: vs,
  getStaticDragOverrideValue: M2,
  OverrideIdsToNodePathsGettersContext: Ym,
  OverrideIdsToNodePathsSettersContext: v2,
  findPropsToDelete: l1,
  makeSequencePropsSubscriptionKey: ut,
  getPropStatusesCtx: k2,
  getEffectPropStatusesCtx: E2,
  hiddenField: fl,
  durationInFramesField: Fs,
  freezeField: vl,
  fromField: pl,
  trimAfterField: tk,
  resolveSequenceCrop: jm,
  useCropStyle: pr
};
Object.assign(G, { useSyncExternalStore: $n });
var pS = (e) => D.Children.toArray(e).reduce((n, r) => r.type === D.Fragment ? n.concat(pS(r.props.children)) : (n.push(r), n), []), VT = {
  durationInFrames: Cn.baseSchema.durationInFrames,
  name: Cn.sequenceSchema.name,
  hidden: Cn.sequenceSchema.hidden,
  showInTimeline: Cn.sequenceSchema.showInTimeline,
  freeze: Cn.baseSchema.freeze,
  trimBefore: Cn.sequenceSchema.trimBefore,
  playbackRate: Cn.sequenceSchema.playbackRate,
  layout: Cn.sequenceSchema.layout
}, zT = l.forwardRef(({ offset: e = 0, className: t = "", _remotionInternalRender: n = null, ...r }, o) => (Vb(), n ? n({ ...r, offset: e, className: t || void 0 }, o) : /* @__PURE__ */ S.jsx(hm, {
  children: r.children
}))), hS = Cn.withSchema({
  Component: zT,
  componentName: "<Series.Sequence>",
  componentIdentity: "dev.remotion.remotion.Series.Sequence",
  schema: VT,
  supportsEffects: !1
}), BT = bl, Hv = ({
  durationInFrames: e,
  offset: t,
  index: n,
  childrenLength: r
}) => {
  const o = `index = ${n}, duration = ${e}`;
  (n !== r - 1 || e !== 1 / 0) && Vr(e, {
    component: "of a <Series.Sequence /> component",
    allowFloats: !0
  });
  const i = t ?? 0;
  if (Number.isNaN(i))
    throw new TypeError(`The "offset" property of a <Series.Sequence /> must not be NaN, but got NaN (${o}).`);
  if (!Number.isFinite(i))
    throw new TypeError(`The "offset" property of a <Series.Sequence /> must be finite, but got ${i} (${o}).`);
  if (i % 1 !== 0)
    throw new TypeError(`The "offset" property of a <Series.Sequence /> must be finite, but got ${i} (${o}).`);
  return i;
}, UT = (e) => {
  const t = Zm(), n = l.useMemo(() => {
    const r = pS(e.children).filter((i) => !Ru.isElementDeleted(i, t)), o = (i, s) => {
      if (i === r.length)
        return null;
      const u = r[i];
      if (typeof u == "string") {
        if (u.trim() === "")
          return o(i + 1, s);
        throw new TypeError(`The <Series /> component only accepts a list of <Series.Sequence /> components as its children, but you passed a string "${u}"`);
      }
      if (u.type !== hS)
        throw new TypeError(`The <Series /> component only accepts a list of <Series.Sequence /> components as its children, but got ${u} instead`);
      const c = u;
      return Hv({
        durationInFrames: c.props.durationInFrames,
        offset: c.props.offset,
        index: i,
        childrenLength: r.length
      }), D.cloneElement(c, {
        _remotionInternalRender: (d, m) => {
          const f = d.durationInFrames, v = f / (d.playbackRate ?? 1);
          if (d.loop)
            throw new Error("<Series.Sequence> does not accept `loop`. Put a looping <Sequence> inside the <Series.Sequence> instead.");
          const {
            durationInFrames: h,
            children: w,
            offset: x,
            controls: g,
            from: p,
            name: y,
            ...C
          } = d, b = Hv({
            durationInFrames: f,
            offset: x,
            index: i,
            childrenLength: r.length
          }), E = s + b, k = s + v + b;
          return /* @__PURE__ */ S.jsxs(S.Fragment, {
            children: [
              /* @__PURE__ */ S.jsx(BT, {
                ref: m,
                name: y || "<Series.Sequence>",
                _remotionInternalDocumentationLink: "https://www.remotion.dev/docs/series",
                controls: g ?? void 0,
                from: E,
                durationInFrames: f,
                ...C,
                _remotionInternalTimelineTrack: {
                  role: "clip",
                  seriesOffset: b
                },
                children: /* @__PURE__ */ S.jsx(hm, {
                  children: w
                })
              }),
              o(i + 1, k)
            ]
          });
        }
      });
    };
    return o(0, 0);
  }, [e.children, t]);
  return /* @__PURE__ */ S.jsx(gp, {
    layout: "none",
    _remotionInternalDocumentationLink: "https://www.remotion.dev/docs/series",
    ...e,
    name: e.name ?? "<Series>",
    children: /* @__PURE__ */ S.jsx(Db, {
      children: n
    })
  });
}, WT = Object.assign($t({
  Component: UT,
  componentName: "<Series>",
  componentIdentity: "dev.remotion.remotion.Series",
  schema: {
    ...ik,
    ...Lm
  },
  supportsEffects: !1
}), {
  Sequence: hS
});
Le(WT);
var qT = (e) => {
  const t = {
    ...e,
    durationInFrames: 1,
    fps: 1
  };
  return D.createElement(ku, t);
};
Le(qT);
var Kv = (e) => Math.round(e * 1e5) / 1e5, Mc = ({
  element: e,
  desiredTime: t,
  logLevel: n,
  mountTime: r
}) => {
  if (Mu(e.currentTime, t))
    return {
      wait: Promise.resolve(t),
      cancel: () => {
      }
    };
  let o, i = null;
  const s = new Promise((u) => {
    o = e.requestVideoFrameCallback((c, d) => {
      const m = d.expectedDisplayTime - c;
      if (m <= 0) {
        u(d.mediaTime);
        return;
      }
      setTimeout(() => {
        u(d.mediaTime);
      }, m + 150);
    });
  }), a = new Promise((u) => {
    const c = () => {
      u();
    };
    e.addEventListener("seeked", c, {
      once: !0
    }), i = () => {
      e.removeEventListener("seeked", c);
    };
  });
  return Qa({
    logLevel: n,
    mediaRef: e,
    time: t,
    why: "Seeking during rendering",
    mountTime: r
  }), {
    wait: Promise.all([s, a]).then(([u]) => u),
    cancel: () => {
      i?.(), e.cancelVideoFrameCallback(o);
    }
  };
}, HT = ({
  element: e,
  desiredTime: t,
  fps: n,
  logLevel: r,
  mountTime: o
}) => {
  const i = 1 / n / 2;
  let s = () => {
  };
  return Number.isFinite(e.duration) && e.currentTime >= e.duration && t >= e.duration ? {
    prom: Promise.resolve(),
    cancel: () => {
    }
  } : {
    prom: new Promise((u, c) => {
      const d = Mc({
        element: e,
        desiredTime: t + i,
        logLevel: r,
        mountTime: o
      });
      d.wait.then((m) => {
        if (Math.abs(t - m) <= i)
          return u();
        const v = t > m ? 1 : -1, h = Mc({
          element: e,
          desiredTime: m + i * v,
          logLevel: r,
          mountTime: o
        });
        s = h.cancel, h.wait.then((w) => {
          const x = Math.abs(t - w);
          if (Kv(x) <= Kv(i))
            return u();
          const g = Mc({
            element: e,
            desiredTime: t + i,
            logLevel: r,
            mountTime: o
          });
          return s = g.cancel, g.wait.then(() => {
            u();
          }).catch((p) => {
            c(p);
          });
        }).catch((w) => {
          c(w);
        });
      }), s = d.cancel;
    }),
    cancel: () => {
      s();
    }
  };
}, KT = ({
  onError: e,
  volume: t,
  allowAmplificationDuringRender: n,
  playbackRate: r,
  onDuration: o,
  toneFrequency: i,
  name: s,
  acceptableTimeShiftInSeconds: a,
  delayRenderRetries: u,
  delayRenderTimeoutInMilliseconds: c,
  loopVolumeCurveBehavior: d,
  audioStreamIndex: m,
  onVideoFrame: f,
  preservePitch: v,
  ...h
}, w) => {
  const x = Hr(), g = hn(), p = ti(d ?? "repeat"), y = zr(), C = l.useRef(null), b = l.useContext(ge), E = b?.playbackRate ?? 1, k = l.useContext(hr), P = ae(), F = Yt(), I = ks(), { delayRender: L, continueRender: _ } = _t(), { registerRenderAsset: O, unregisterRenderAsset: N } = l.useContext(Gr), j = l.useMemo(() => `video-${js(h.src ?? "")}-${b?.cumulatedFrom}-${b?.relativeFrom}-${b?.durationInFrames}`, [
    h.src,
    b?.cumulatedFrom,
    b?.relativeFrom,
    b?.durationInFrames
  ]), V = ni({
    volume: t,
    frame: p,
    mediaVolume: 1
  });
  ri(V);
  const B = $l(), { shouldUseAudio: A } = oi({
    muted: h.muted ?? !1,
    volume: V,
    audioEnabled: B
  });
  if (!y)
    throw new Error("No video config found");
  l.useEffect(() => {
    if (!h.src)
      throw new Error("No src passed");
    if (A)
      return O({
        type: "video",
        src: pn(h.src),
        id: j,
        frame: x,
        volume: V,
        mediaFrame: k + (g - k) / E,
        playbackRate: (r ?? 1) * E,
        toneFrequency: i ?? 1,
        audioStartFrame: k,
        audioStreamIndex: m ?? 0,
        preservePitch: v ?? !0
      }), () => N(j);
  }, [
    A,
    h.src,
    O,
    j,
    N,
    V,
    g,
    x,
    r,
    i,
    k,
    E,
    m,
    v
  ]), l.useImperativeHandle(w, () => C.current, []), mS({ ref: C, onVideoFrame: f }), l.useEffect(() => {
    if (!window.remotion_videoEnabled)
      return;
    const { current: M } = C;
    if (!M)
      return;
    const R = B1({
      frame: g,
      playbackRate: r || 1,
      startFrom: k,
      fps: y.fps
    }), $ = L(`Rendering <Html5Video /> with src="${h.src}" at time ${R}`, {
      retries: u ?? void 0,
      timeoutInMilliseconds: c ?? void 0
    });
    if (window.process?.env?.NODE_ENV === "test") {
      _($);
      return;
    }
    if (Mu(M.currentTime, R)) {
      if (M.readyState >= 2) {
        _($);
        return;
      }
      const U = () => {
        _($);
      };
      return M.addEventListener("loadeddata", U, { once: !0 }), () => {
        M.removeEventListener("loadeddata", U);
      };
    }
    const z = () => {
      _($);
    }, q = HT({
      element: M,
      desiredTime: R,
      fps: y.fps,
      logLevel: F,
      mountTime: I
    });
    q.prom.then(() => {
      _($);
    }), M.addEventListener("ended", z, { once: !0 });
    const H = () => {
      if (M?.error) {
        if (console.error("Error occurred in video", M?.error), e)
          return;
        throw new Po({
          message: `The browser threw an error while playing the video ${h.src}: Code ${M.error.code} - ${M?.error?.message}. See https://remotion.dev/docs/media-playback-error for help. Pass an onError() prop to handle the error.`,
          src: h.src
        });
      } else
        throw new Po({
          message: "The browser threw an error",
          src: h.src
        });
    };
    return M.addEventListener("error", H, { once: !0 }), () => {
      q.cancel(), M.removeEventListener("ended", z), M.removeEventListener("error", H), _($);
    };
  }, [
    p,
    h.src,
    r,
    y.fps,
    g,
    k,
    e,
    u,
    c,
    F,
    I,
    _,
    L
  ]);
  const { src: T } = h;
  return P.isRendering && l.useLayoutEffect(() => {
    if (window.process?.env?.NODE_ENV === "test")
      return;
    const M = L("Loading <Html5Video> duration with src=" + T, {
      retries: u ?? void 0,
      timeoutInMilliseconds: c ?? void 0
    }), { current: R } = C, $ = () => {
      R?.duration && o(T, R.duration), _(M);
    };
    return R?.duration ? (o(T, R.duration), _(M)) : R?.addEventListener("loadedmetadata", $, { once: !0 }), () => {
      R?.removeEventListener("loadedmetadata", $), _(M);
    };
  }, [
    T,
    o,
    u,
    c,
    _,
    L
  ]), /* @__PURE__ */ S.jsx("video", {
    ref: C,
    disableRemotePlayback: !0,
    ...h
  });
}, GT = l.forwardRef(KT), YT = (e, t) => {
  const {
    startFrom: n,
    endAt: r,
    trimBefore: o,
    trimAfter: i,
    durationInFrames: s,
    name: a,
    pauseWhenBuffering: u,
    _remotionInternalStack: c,
    _remotionInternalNativeLoopPassed: d,
    showInTimeline: m,
    onAutoPlayError: f,
    onVideoFrame: v,
    ...h
  } = e, { loop: w, ...x } = e, { fps: g } = bt(), p = ae(), y = Ps(u);
  if (p.isClientSideRendering)
    throw new Error("<Html5Video> is not supported in @remotion/web-renderer. Use <Video> from @remotion/media instead. See https://remotion.dev/docs/client-side-rendering/limitations");
  const { durations: C, setDurations: b } = l.useContext(np);
  if (typeof t == "string")
    throw new Error("string refs are not supported");
  if (typeof e.src != "string")
    throw new TypeError(`The \`<Html5Video>\` tag requires a string for \`src\`, but got ${JSON.stringify(e.src)} instead.`);
  const E = Yr(e.src), k = l.useMemo(() => M1.bind(null, b), [b]), P = C[pn(E)] ?? C[pn(e.src)];
  Tl({ startFrom: n, endAt: r, trimBefore: o, trimAfter: i }), s !== void 0 && Vr(s, {
    component: "of the <Html5Video /> component",
    allowFloats: !0
  });
  const { trimBeforeValue: F, trimAfterValue: I } = Rl({
    startFrom: n,
    endAt: r,
    trimBefore: o,
    trimAfter: i
  }), L = tp({
    durationInFrames: s,
    trimAfter: I,
    trimBefore: F
  }), _ = L ?? (P === void 0 ? void 0 : P * g);
  return w && _ !== void 0 ? Number.isFinite(_) ? /* @__PURE__ */ S.jsx(kl, {
    durationInFrames: El({
      trimAfter: L,
      mediaDurationInFrames: _,
      playbackRate: e.playbackRate ?? 1,
      trimBefore: F
    }),
    layout: "none",
    name: a,
    showInTimeline: !1,
    children: /* @__PURE__ */ S.jsx(Za, {
      ...x,
      ref: t,
      _remotionInternalStack: c,
      _remotionInternalNativeLoopPassed: !0
    })
  }) : /* @__PURE__ */ S.jsx(Za, {
    ...x,
    ref: t,
    _remotionInternalStack: c,
    _remotionInternalNativeLoopPassed: !0
  }) : typeof F < "u" || typeof L < "u" ? /* @__PURE__ */ S.jsx(hr.Provider, {
    value: F ?? 0,
    children: /* @__PURE__ */ S.jsx(mt, {
      layout: "none",
      from: 0 - (F ?? 0),
      showInTimeline: !1,
      durationInFrames: L === void 0 ? void 0 : (F ?? 0) + (L - (F ?? 0)) / (e.playbackRate ?? 1),
      name: a,
      children: /* @__PURE__ */ S.jsx(Za, {
        pauseWhenBuffering: y,
        onVideoFrame: v,
        ...h,
        ref: t,
        showInTimeline: m,
        _remotionInternalStack: c
      })
    })
  }) : (Il({
    playbackRate: e.playbackRate,
    preservePitch: e.preservePitch,
    volume: e.volume
  }, "Html5Video"), p.isRendering ? /* @__PURE__ */ S.jsx(GT, {
    onDuration: k,
    onVideoFrame: v ?? null,
    ...h,
    ref: t
  }) : /* @__PURE__ */ S.jsx(yp, {
    onlyWarnForMediaSeekingError: !1,
    ...h,
    ref: t,
    onVideoFrame: v ?? null,
    pauseWhenBuffering: y,
    onDuration: k,
    _remotionInternalStack: c ?? null,
    _remotionInternalNativeLoopPassed: d ?? !1,
    showInTimeline: m ?? !0,
    onAutoPlayError: f ?? void 0
  }));
}, Za = l.forwardRef(YT);
Le(Za);
qE();
var QT = {}, JT = new Proxy(QT, {
  get(e, t) {
    return t === "Bundling" || t === "Rendering" || t === "Log" || t === "Puppeteer" || t === "Output" ? JT : () => {
      console.warn("⚠️  The CLI configuration has been extracted from Remotion Core."), console.warn("Update the import from the config file:"), console.warn(), console.warn("- Delete:"), console.warn('import {Config} from "remotion";'), console.warn("+ Replace:"), console.warn('import {Config} from "@remotion/cli/config";'), console.warn(), console.warn("For more information, see https://www.remotion.dev/docs/4-0-migration."), process.exit(1);
    };
  }
});
mt.displayName = "Sequence";
Le(mt);
VE(mt);
Le(ku);
Le(Kb);
var Er = (e, t) => {
  if (typeof e == "number")
    return e;
  if (e.type === "literal")
    return e.value;
  if (e.type === "binary") {
    const r = Er(e.left, t), o = Er(e.right, t);
    switch (e.operator) {
      case "+":
        return r + o;
      case "-":
        return r - o;
      case "*":
        return r * o;
      case "/":
        return r / o;
      default:
        throw new Error("Unknown source expression operator");
    }
  }
  const n = e.binding.type === "constant" ? e.binding.value : t?.[e.binding.field] ?? NaN;
  return e.type === "video-config-multiplication" ? n * e.multiplier : e.type === "video-config-subtraction" ? n - e.subtrahend : n;
}, Gv = /* @__PURE__ */ new WeakMap(), ZT = (e, t) => {
  const n = t === null ? "" : `${t.durationInFrames}:${t.fps}:${t.width}:${t.height}`, r = Gv.get(e) ?? /* @__PURE__ */ new Map(), o = r.get(n);
  if (o)
    return o;
  const i = Object.fromEntries(Object.entries(e).map(([s, a]) => {
    if (a.status === "computed")
      return [s, a];
    const u = a.keyframeDisplayOffsetAdjustment === null ? null : Er(a.keyframeDisplayOffsetAdjustment, t), c = Er(a.keyframePlaybackRateAdjustment ?? 1, t);
    if (u !== null && !Number.isFinite(u) || !Number.isFinite(c) || c <= 0)
      return [s, { status: "computed" }];
    const d = {
      keyframeDisplayOffsetAdjustment: u,
      ...a.keyframePlaybackRateAdjustment === void 0 ? {} : { keyframePlaybackRateAdjustment: c }
    };
    if (a.status === "static") {
      const f = a.numericExpression === void 0 ? a.codeValue : Er(a.numericExpression, t);
      return [
        s,
        a.numericExpression !== void 0 && !Number.isFinite(f) ? { status: "computed" } : { ...a, ...d, codeValue: f }
      ];
    }
    const m = a.keyframes.map((f) => ({
      ...f,
      frame: Er(f.frame, t)
    }));
    return m.some((f, v) => !Number.isFinite(f.frame) || v > 0 && f.frame <= m[v - 1].frame) ? [s, { status: "computed" }] : [s, { ...a, ...d, keyframes: m }];
  }));
  return r.set(n, i), r.size > 8 && r.delete(r.keys().next().value), Gv.set(e, r), i;
}, XT = 1 / 0, eR = 4, tR = 1e-3, nR = 1e-7, rR = 10, Di = 11, ka = 1 / (Di - 1), oR = typeof Float32Array == "function";
function vS(e, t) {
  return 1 - 3 * t + 3 * e;
}
function gS(e, t) {
  return 3 * t - 6 * e;
}
function yS(e) {
  return 3 * e;
}
function Nu(e, t, n) {
  return ((vS(t, n) * e + gS(t, n)) * e + yS(t)) * e;
}
function wS(e, t, n) {
  return 3 * vS(t, n) * e * e + 2 * gS(t, n) * e + yS(t);
}
function iR({
  aX: e,
  _aA: t,
  _aB: n,
  mX1: r,
  mX2: o
}) {
  let i, s, a = 0, u = t, c = n;
  do
    s = u + (c - u) / 2, i = Nu(s, r, o) - e, i > 0 ? c = s : u = s;
  while (Math.abs(i) > nR && ++a < rR);
  return s;
}
function sR(e, t, n, r) {
  let o = t;
  for (let i = 0; i < eR; ++i) {
    const s = wS(o, n, r);
    if (s === 0)
      return o;
    const a = Nu(o, n, r) - e;
    o -= a / s;
  }
  return o;
}
function aR(e, t, n, r) {
  if (!(e >= 0 && e <= 1 && n >= 0 && n <= 1))
    throw new Error("bezier x values must be in [0, 1] range");
  const o = oR ? new Float32Array(Di) : new Array(Di);
  if (e !== t || n !== r)
    for (let s = 0; s < Di; ++s)
      o[s] = Nu(s * ka, e, n);
  function i(s) {
    let a = 0, u = 1;
    const c = Di - 1;
    for (; u !== c && o[u] <= s; ++u)
      a += ka;
    --u;
    const d = (s - o[u]) / (o[u + 1] - o[u]), m = a + d * ka, f = wS(m, e, n);
    return f >= tR ? sR(s, m, e, n) : f === 0 ? m : iR({
      aX: s,
      _aA: a,
      _aB: a + ka,
      mX1: e,
      mX2: n
    });
  }
  return function(s) {
    const a = Math.min(1, Math.max(0, s));
    return e === t && n === r ? a : a === 0 ? 0 : a === 1 ? 1 : Nu(i(a), t, r);
  };
}
var SS = ({
  allowFloats: e,
  durationInFrames: t,
  frame: n
}) => {
  if (typeof n > "u")
    throw new TypeError('Argument missing for parameter "frame"');
  if (typeof n != "number")
    throw new TypeError(`Argument passed for "frame" is not a number: ${n}`);
  if (!Number.isFinite(n))
    throw new RangeError(`Frame ${n} is not finite`);
  if (n % 1 !== 0 && !e)
    throw new RangeError(`Argument for frame must be an integer, but got ${n}`);
  if (n < 0 && n < -t)
    throw new RangeError(`Cannot use frame ${n}: Duration of composition is ${t}, therefore the lowest frame that can be rendered is ${-t}`);
  if (n > t - 1)
    throw new RangeError(`Cannot use frame ${n}: Duration of composition is ${t}, therefore the highest frame that can be rendered is ${t - 1}`);
};
function Sp(e, t, n) {
  if (typeof e != "number")
    throw new Error(`"fps" must be a number, but you passed a value of type ${typeof e} ${t}`);
  if (!Number.isFinite(e))
    throw new Error(`"fps" must be a finite, but you passed ${e} ${t}`);
  if (isNaN(e))
    throw new Error(`"fps" must not be NaN, but got ${e} ${t}`);
  if (e <= 0)
    throw new TypeError(`"fps" must be positive, but got ${e} ${t}`);
  if (n && e > 50)
    throw new TypeError("The FPS for a GIF cannot be higher than 50. Use the --every-nth-frame option to lower the FPS: https://remotion.dev/docs/render-as-gif");
}
var uR = (e) => {
  if (!(typeof e > "u")) {
    if (typeof e != "number")
      throw new TypeError(`A "duration" of a spring must be a "number" but is "${typeof e}"`);
    if (Number.isNaN(e))
      throw new TypeError('A "duration" of a spring is NaN, which it must not be');
    if (!Number.isFinite(e))
      throw new TypeError('A "duration" of a spring must be finite, but is ' + e);
    if (e <= 0)
      throw new TypeError('A "duration" of a spring must be positive, but is ' + e);
  }
}, Pa = {
  damping: 10,
  mass: 1,
  stiffness: 100,
  overshootClamping: !1
}, Nc = {};
function Yv({
  animation: e,
  now: t,
  config: n
}) {
  const { toValue: r, lastTimestamp: o, current: i, velocity: s } = e, a = Math.min(t - o, 64);
  if (n.damping <= 0)
    throw new Error("Spring damping must be greater than 0, otherwise the spring() animation will never end, causing an infinite loop.");
  const u = n.damping, c = n.mass, d = n.stiffness, m = [
    r,
    o,
    i,
    s,
    u,
    c,
    d,
    t
  ].join("-");
  if (Nc[m])
    return Nc[m];
  const f = -s, v = r - i, h = u / (2 * Math.sqrt(d * c)), w = Math.sqrt(d / c), x = w * Math.sqrt(1 - h ** 2), g = a / 1e3, p = Math.sin(x * g), y = Math.cos(x * g), C = Math.exp(-h * w * g), b = C * (p * ((f + h * w * v) / x) + v * y), E = r - b, k = h * w * b - C * (y * (f + h * w * v) - x * v * p), P = Math.exp(-w * g), F = r - P * (v + (f + w * v) * g), I = P * (f * (g * w - 1) + g * v * w * w), L = {
    toValue: r,
    prevPosition: i,
    lastTimestamp: t,
    current: h < 1 ? E : F,
    velocity: h < 1 ? k : I
  };
  return Nc[m] = L, L;
}
var Ia = {};
function xS({
  frame: e,
  fps: t,
  config: n = {}
}) {
  const i = {
    damping: n.damping ?? Pa.damping,
    mass: n.mass ?? Pa.mass,
    stiffness: n.stiffness ?? Pa.stiffness,
    overshootClamping: n.overshootClamping ?? Pa.overshootClamping
  }, s = [
    t,
    i.damping,
    i.mass,
    i.overshootClamping,
    i.stiffness
  ].join("-"), a = `${e}-${s}`;
  if (Ia[a])
    return Ia[a];
  const u = Math.max(0, e), c = Math.ceil(u) - 1, d = c >= 0 ? Ia[`${c}-${s}`] : void 0;
  let m = d ?? {
    lastTimestamp: 0,
    current: 0,
    toValue: 1,
    velocity: 0,
    prevPosition: 0
  };
  const f = u % 1, v = d ? c + 1 : 0;
  for (let h = v; h <= Math.floor(u); h++) {
    const w = h / t * 1e3;
    m = Yv({
      animation: m,
      now: w,
      config: i
    });
  }
  return f > 0 && (m = Yv({
    animation: m,
    now: u / t * 1e3,
    config: i
  })), Ia[a] = m, m;
}
var $c = /* @__PURE__ */ new Map();
function CS({
  fps: e,
  config: t = {},
  threshold: n = 5e-3
}) {
  if (typeof n != "number")
    throw new TypeError(`threshold must be a number, got ${n} of type ${typeof n}`);
  if (n === 0)
    return 1 / 0;
  if (n === 1)
    return 0;
  if (isNaN(n))
    throw new TypeError("Threshold is NaN");
  if (!Number.isFinite(n))
    throw new TypeError("Threshold is not finite");
  if (n < 0)
    throw new TypeError("Threshold is below 0");
  const r = [
    e,
    t.damping,
    t.mass,
    t.overshootClamping,
    t.stiffness,
    n
  ].join("-");
  if ($c.has(r))
    return $c.get(r);
  Sp(e, "to the measureSpring() function", !1);
  let o = 0, i = 0;
  const s = () => xS({
    fps: e,
    frame: o,
    config: t
  });
  let a = s();
  const u = () => Math.abs(a.current - a.toValue);
  let c = u();
  for (; c >= n; )
    o++, a = s(), c = u();
  i = o;
  for (let d = 0; d < 20; d++)
    o++, a = s(), c = u(), c >= n && (d = 0, i = o + 1);
  return $c.set(r, i), i;
}
function Qv({
  frame: e,
  fps: t,
  config: n = {},
  from: r = 0,
  to: o = 1,
  durationInFrames: i,
  durationRestThreshold: s,
  delay: a = 0,
  reverse: u = !1
}) {
  uR(i), SS({
    frame: e,
    durationInFrames: 1 / 0,
    allowFloats: !0
  }), Sp(t, "to spring()", !1);
  const c = u || typeof i < "u", d = c ? CS({
    fps: t,
    config: n,
    threshold: s
  }) : void 0, m = c ? {
    get: () => d
  } : {
    get: () => {
      throw new Error("did not calculate natural duration, this is an error with Remotion. Please report");
    }
  }, v = (u ? (i ?? m.get()) - e : e) + (u ? a : -a), h = i === void 0 ? v : v / (i / m.get());
  if (i && v > i)
    return o;
  const w = xS({
    fps: t,
    frame: h,
    config: n
  }), x = n.overshootClamping ? Math.min(w.current, 1) : w.current;
  return r === 0 && o === 1 ? x : PS(x, [0, 1], [r, o]);
}
var Jv = (e) => Math.min(1, Math.max(0, e)), ki = 30, Zv = null;
class xp {
  static step0(t) {
    return t > 0 ? 1 : 0;
  }
  static step1(t) {
    return t >= 1 ? 1 : 0;
  }
  static linear(t) {
    return t;
  }
  static ease(t) {
    return Zv ?? (Zv = xp.bezier(0.42, 0, 1, 1)), Zv(t);
  }
  static quad(t) {
    return t * t;
  }
  static cubic(t) {
    return t * t * t;
  }
  static poly(t) {
    return (n) => n ** t;
  }
  static sin(t) {
    return 1 - Math.cos(t * Math.PI / 2);
  }
  static circle(t) {
    const n = Jv(t);
    return 1 - Math.sqrt(1 - n * n);
  }
  static exp(t) {
    return 2 ** (10 * (t - 1));
  }
  static elastic(t = 1) {
    const n = t * Math.PI;
    return (r) => 1 - Math.cos(r * Math.PI / 2) ** 3 * Math.cos(r * n);
  }
  static back(t = 1.70158) {
    return (n) => n * n * ((t + 1) * n - t);
  }
  static spring({
    allowTail: t = !1,
    durationRestThreshold: n,
    ...r
  } = {}) {
    return Object.assign((i) => i <= 0 ? 0 : !t && i >= 1 ? 1 : Qv(t ? {
      fps: ki,
      frame: i * CS({
        fps: ki,
        config: r,
        threshold: n
      }),
      config: r
    } : {
      fps: ki,
      frame: i * ki,
      config: r,
      durationInFrames: ki,
      durationRestThreshold: n
    }), {
      remotionShouldExtendRight: t
    });
  }
  static bounce(t) {
    const n = Jv(t);
    if (n < 1 / 2.75)
      return 7.5625 * n * n;
    if (n < 2 / 2.75) {
      const o = n - 0.5454545454545454;
      return 7.5625 * o * o + 0.75;
    }
    if (n < 2.5 / 2.75) {
      const o = n - 0.8181818181818182;
      return 7.5625 * o * o + 0.9375;
    }
    const r = n - 2.625 / 2.75;
    return 7.5625 * r * r + 0.984375;
  }
  static bezier(t, n, r, o) {
    return aR(t, n, r, o);
  }
  static in(t) {
    return t;
  }
  static out(t) {
    return (n) => 1 - t(1 - n);
  }
  static inOut(t) {
    return (n) => n < 0.5 ? t(n * 2) / 2 : 1 - t((1 - n) * 2) / 2;
  }
}
var Xa = (e) => Math.round(e * 1e6) / 1e6, lR = /* @__PURE__ */ new Set(["deg", "rad", "grad", "turn"]), bS = /* @__PURE__ */ new Set([
  "%",
  "cap",
  "ch",
  "cm",
  "cqb",
  "cqh",
  "cqi",
  "cqmax",
  "cqmin",
  "cqw",
  "dvh",
  "dvw",
  "em",
  "ex",
  "ic",
  "in",
  "lh",
  "lvh",
  "lvw",
  "mm",
  "pc",
  "pt",
  "px",
  "q",
  "rem",
  "rlh",
  "svh",
  "svw",
  "vb",
  "vh",
  "vi",
  "vmax",
  "vmin",
  "vw"
]), Cp = /^([+-]?(?:\d+\.?\d*|\.\d+))([a-zA-Z%]+)?$/, uf = /* @__PURE__ */ new Set([
  "left",
  "center",
  "right",
  "top",
  "bottom"
]), Io = (e) => e === "left" ? [{ axis: "x", value: { value: 0, unit: "%" } }] : e === "right" ? [{ axis: "x", value: { value: 100, unit: "%" } }] : e === "top" ? [{ axis: "y", value: { value: 0, unit: "%" } }] : e === "bottom" ? [{ axis: "y", value: { value: 100, unit: "%" } }] : [
  { axis: "x", value: { value: 50, unit: "%" } },
  { axis: "y", value: { value: 50, unit: "%" } }
], Pi = { value: 50, unit: "%" }, lo = (e) => String(Xa(e));
class bp extends TypeError {
}
var lf = (e, t) => {
  const n = Cp.exec(e);
  if (n === null)
    throw new bp(`Cannot interpolate "${t}" because "${e}" is not a supported scale, translate, or rotate value`);
  const r = n[2] ?? null, o = Number(n[1]);
  if (!Number.isFinite(o))
    throw new TypeError(`Cannot interpolate "${t}" because "${e}" is not finite`);
  if (r === null)
    return { kind: "scale", value: o, unit: null };
  if (lR.has(r))
    return { kind: "rotate", value: o, unit: r };
  if (bS.has(r))
    return { kind: "translate", value: o, unit: r };
  throw new TypeError(`Cannot interpolate "${t}" because "${r}" is not a supported translate or rotate unit`);
}, ES = ({
  component: e,
  value: t,
  allowPercentage: n
}) => {
  const r = Cp.exec(e);
  if (r === null)
    throw new TypeError(`Cannot interpolate "${t}" because "${e}" is not a supported transform-origin ${n ? "length-percentage" : "z length"}`);
  const o = r[2] ?? null, i = Number(r[1]);
  if (!Number.isFinite(i))
    throw new TypeError(`Cannot interpolate "${t}" because "${e}" is not finite`);
  if (o === null || !bS.has(o) || !n && o === "%")
    throw new TypeError(`Cannot interpolate "${t}" because "${e}" is not a supported transform-origin ${n ? "length-percentage" : "z length"}`);
  return { value: i, unit: o };
}, _c = (e, t) => {
  const n = e.toLowerCase();
  return uf.has(n) ? { type: "keyword", keyword: n } : {
    type: "length-percentage",
    parsed: ES({
      component: e,
      value: t,
      allowPercentage: !0
    })
  };
}, cR = (e, t, n) => {
  const r = [];
  for (const o of Io(e))
    for (const i of Io(t))
      o.axis !== i.axis && r.push(o.axis === "x" ? [o.value, i.value] : [i.value, o.value]);
  if (r.length === 0)
    throw new TypeError(`Cannot interpolate "${n}" because "${e} ${t}" is not a valid transform-origin keyword pair`);
  return r[0];
}, dR = (e, t) => {
  if (e.length === 1) {
    const a = _c(e[0], t);
    return a.type === "length-percentage" ? [a.parsed, Pi] : a.keyword === "top" || a.keyword === "bottom" ? [
      Pi,
      Io(a.keyword)[0].value
    ] : [
      Io(a.keyword)[0].value,
      Pi
    ];
  }
  const n = _c(e[0], t), r = _c(e[1], t);
  if (n.type === "length-percentage" && r.type === "length-percentage")
    return [n.parsed, r.parsed];
  if (n.type === "keyword" && r.type === "keyword")
    return cR(n.keyword, r.keyword, t);
  const o = n.type === "keyword" ? n : r.type === "keyword" ? r : null, i = n.type === "length-percentage" ? n.parsed : r.type === "length-percentage" ? r.parsed : null;
  if (o === null || i === null)
    throw new Error("Expected a keyword and a length-percentage value");
  const s = n.type === "keyword";
  if (o.keyword === "left" || o.keyword === "right") {
    if (!s)
      throw new TypeError(`Cannot interpolate "${t}" because horizontal transform-origin keywords must come before a length-percentage value`);
    return [Io(o.keyword)[0].value, i];
  }
  return o.keyword === "top" || o.keyword === "bottom" ? [i, Io(o.keyword)[0].value] : s ? [Pi, i] : [i, Pi];
}, fR = (e, t) => {
  const [n, r] = dR(t.slice(0, 2), e), o = t[2] === void 0 ? { value: 0, unit: null } : ES({
    component: t[2],
    value: e,
    allowPercentage: !1
  });
  return {
    kind: "translate",
    values: [n.value, r.value, o.value, 0],
    units: [n.unit, r.unit, o.unit, null],
    dimensions: t[2] === void 0 ? 2 : 3,
    axisRotation: !1
  };
}, mR = (e) => {
  const t = e.trim().split(/\s+/), n = t.length === 2 ? t[0].toLowerCase() : null;
  if (n === "x" || n === "y" || n === "z") {
    const i = lf(t[1], e);
    return i.kind !== "rotate" ? null : {
      kind: "rotate",
      values: n === "x" ? [1, 0, 0, i.value] : n === "y" ? [0, 1, 0, i.value] : [0, 0, 1, i.value],
      units: [null, null, null, i.unit],
      dimensions: 4,
      axisRotation: !0
    };
  }
  if (t.length !== 4)
    return null;
  const r = t.slice(0, 3).map(Number);
  if (!r.every(Number.isFinite))
    return null;
  const o = lf(t[3], e);
  return o.kind !== "rotate" ? null : {
    kind: "rotate",
    values: [r[0], r[1], r[2], o.value],
    units: [null, null, null, o.unit],
    dimensions: 4,
    axisRotation: !0
  };
}, kS = (e, t) => {
  if (typeof e == "number") {
    if (!Number.isFinite(e))
      throw new Error(`outputRange must contain only finite numbers, but got [${e}]`);
    return {
      kind: "scale",
      values: [e, e, 1, 0],
      units: [null, null, null, null],
      dimensions: 1,
      axisRotation: !1
    };
  }
  const n = mR(e);
  if (n !== null)
    return n;
  const r = e.trim().split(/\s+/);
  if (r.length < 1 || r.length > 3 || r[0] === "") {
    const s = r.some((a) => !Cp.test(a) && !uf.has(a.toLowerCase())) ? bp : TypeError;
    throw new s(`String outputRange values must contain 1 to 3 components, but got "${e}"`);
  }
  if (r.some((s) => uf.has(s.toLowerCase())))
    return fR(e, r);
  const o = r.map((s) => lf(s, e)), [{ kind: i }] = o;
  for (const s of o)
    if (s.kind !== i)
      throw new TypeError(`Cannot interpolate "${e}" because it mixes ${i} and ${s.kind} values`);
  if (i === "scale") {
    const s = o[0].value, a = o[1]?.value ?? s, u = o[2]?.value ?? 1;
    return {
      kind: i,
      values: [s, a, u, 0],
      units: [null, null, null, null],
      dimensions: o.length,
      axisRotation: !1
    };
  }
  return {
    kind: i,
    values: [o[0].value, o[1]?.value ?? 0, o[2]?.value ?? 0, 0],
    units: [
      o[0].unit,
      o[1]?.unit ?? null,
      o[2]?.unit ?? null,
      null
    ],
    dimensions: o.length,
    axisRotation: !1
  };
}, pR = ({
  kind: e,
  values: t,
  units: n,
  dimensions: r,
  axisRotation: o
}) => o ? `${lo(t[0])} ${lo(t[1])} ${lo(t[2])} ${lo(t[3])}${n[3]}` : e === "scale" ? t.slice(0, r).map((i) => lo(i)).join(" ") : t.slice(0, r).map((i, s) => `${lo(i)}${n[s]}`).join(" ");
function hR(e, t, n, r) {
  const { easing: o } = r;
  let i = e;
  const [s, a] = t, [u, c] = n;
  return u === c ? u : (i = (i - s) / (a - s), i = o(i), i = i * (c - u) + u, i);
}
function Ep(e, t) {
  let n;
  for (n = 1; n < t.length - 1 && !(t[n] >= e); ++n)
    ;
  return n - 1;
}
var vR = (e) => e, gR = (e) => "linear", yR = (e) => e.remotionShouldExtendRight === !0, cf = ({
  easing: e,
  segmentIndex: t
}) => vR, Xv = ({
  input: e,
  inputRange: t,
  outputRange: n,
  easing: r,
  extrapolateLeft: o,
  extrapolateRight: i,
  output: s
}) => hR(e, t, n, {
  easing: r,
  extrapolateRight: e > t[1] && i === "clamp" ? "extend" : i
}), kp = ({
  input: e,
  inputRange: t,
  options: n
}) => {
  const r = e;
  return t[0], t[t.length - 1], t.length, r;
}, Pp = ({
  input: e,
  inputRange: t,
  outputRange: n,
  options: r
}) => {
  const o = gR();
  if (t.length === 1)
    return n[0];
  const i = r?.easing;
  let s = "extend", a = "extend";
  const u = kp({
    input: e,
    inputRange: t,
    options: null
  }), c = Ep(u, t), d = cf({
    easing: i,
    segmentIndex: c
  });
  let m = Xv({
    input: u,
    inputRange: [t[c], t[c + 1]],
    outputRange: [n[c], n[c + 1]],
    easing: d,
    extrapolateLeft: s,
    extrapolateRight: a,
    output: o
  });
  for (let f = 0; f < c; f++) {
    const v = cf({
      easing: i,
      segmentIndex: f
    });
    if (!yR(v))
      continue;
    const h = t[f + 1];
    if (u <= h)
      continue;
    const w = Xv({
      input: u,
      inputRange: [t[f], h],
      outputRange: [n[f], n[f + 1]],
      easing: v,
      extrapolateLeft: s,
      extrapolateRight: "extend",
      output: o
    });
    m += w - n[f + 1];
  }
  return m;
}, wR = ({
  input: e,
  inputRange: t,
  outputRange: n,
  options: r,
  outputType: o
}) => {
  const i = n.map((h) => kS(h)), s = i.some((h) => h.axisRotation), a = kp({
    input: e,
    inputRange: t,
    options: null
  }), u = t.length === 1 ? 0 : Ep(a, t), c = s ? i.map((h, w) => {
    if (h.kind !== "rotate" || h.axisRotation)
      return h;
    if (h.dimensions !== 1)
      throw new TypeError("Cannot interpolate a multi-angle rotate value with an axis rotation");
    const x = h.values[0] === 0 ? w === 0 ? i.find((p) => p.axisRotation) : w === i.length - 1 ? [...i].reverse().find((p) => p.axisRotation) : w === u ? i[w + 1] : w === u + 1 ? i[w - 1] : void 0 : void 0, g = x?.axisRotation ? x.values : [0, 0, 1];
    return {
      kind: "rotate",
      values: [g[0], g[1], g[2], h.values[0]],
      units: [null, null, null, h.units[0]],
      dimensions: 4,
      axisRotation: !0
    };
  }) : i, d = c[0]?.kind;
  if (d === void 0)
    throw new Error("outputRange must have at least 1 element");
  for (const h of c)
    if (h.kind !== d)
      throw new TypeError(`Cannot interpolate ${d} values with ${h.kind} values`);
  const m = Math.max(...c.map((h) => h.dimensions)), f = [
    null,
    null,
    null,
    null
  ];
  if (d !== "scale") {
    for (let h = 0; h < m; h++)
      if (!(s && h < 3)) {
        for (const w of c) {
          const x = w.units[h];
          if (x !== null) {
            if (f[h] === null) {
              f[h] = x;
              continue;
            }
            if (f[h] !== x)
              throw new TypeError(`Cannot interpolate ${d} values with different units on axis ${h + 1}: ${f[h]} and ${x}`);
          }
        }
        if (f[h] === null)
          throw new TypeError(`Cannot interpolate ${d} values because axis ${h + 1} has no unit`);
      }
  }
  const v = [0, 0, 0, 0];
  for (let h = 0; h < m; h++)
    v[h] = Pp({
      input: e,
      inputRange: t,
      outputRange: c.map((w) => w.values[h]),
      options: r
    });
  return pR({
    kind: d,
    values: v,
    units: f,
    dimensions: m,
    axisRotation: s
  });
}, eg = ({
  input: e,
  inputRange: t,
  outputRange: n,
  options: r
}) => {
  if (t.length === 1)
    return n[0];
  for (let u = 0; u < t.length - 1; u++)
    if (cf({
      easing: r?.easing,
      segmentIndex: u
    }) !== xp.step1)
      throw new TypeError(typeof n[0] == "boolean" ? "Booleans can only be interpolated using Easing.step1" : "Non-numeric strings can only be interpolated using Easing.step1");
  const o = kp({
    input: e,
    inputRange: t,
    options: null
  }), i = t[0], s = t[t.length - 1];
  if (o < i)
    return n[0];
  if (o > s)
    return n[n.length - 1];
  const a = Ep(o, t);
  return o >= t[a + 1] ? n[a + 1] : n[a];
}, SR = (e) => {
  const t = e[0]?.length;
  if (t === void 0)
    throw new Error("outputRange must have at least 1 element");
  if (t === 0)
    throw new TypeError("outputRange tuples must contain at least 1 number");
  for (const n of e) {
    if (n.length !== t)
      throw new TypeError(`outputRange tuples must all have the same length, but got ${t} and ${n.length}`);
    for (const r of n)
      if (typeof r != "number" || !Number.isFinite(r))
        throw new TypeError(`outputRange tuples must contain only finite numbers, but got [${n.join(",")}]`);
  }
  return t;
}, xR = ({
  input: e,
  inputRange: t,
  outputRange: n,
  options: r
}) => {
  const o = SR(n);
  return new Array(o).fill(!0).map((i, s) => Pp({
    input: e,
    inputRange: t,
    outputRange: n.map((a) => a[s]),
    options: r
  }));
};
function CR(e) {
  for (let t = 1; t < e.length; ++t)
    if (!(e[t] > e[t - 1]))
      throw new Error(`inputRange must be strictly monotonically increasing but got [${e.join(",")}]`);
}
function tg(e, t) {
  if (t.length < 1)
    throw new Error(e + " must have at least 1 element");
  for (const n of t) {
    if (typeof n != "number")
      throw new Error(`${e} must contain only numbers`);
    if (!Number.isFinite(n))
      throw new Error(`${e} must contain only finite numbers, but got [${t.join(",")}]`);
  }
}
function PS(e, t, n, r) {
  if (typeof e > "u")
    throw new Error("input can not be undefined");
  if (typeof t > "u")
    throw new Error("inputRange can not be undefined");
  if (typeof n > "u")
    throw new Error("outputRange can not be undefined");
  if (t.length !== n.length)
    throw new Error("inputRange (" + t.length + ") and outputRange (" + n.length + ") must have the same length");
  if (tg("inputRange", t), CR(t), r?.easing, t.length, typeof e != "number")
    throw new TypeError("Cannot interpolate an input which is not a number");
  if (!Array.isArray(n))
    throw new Error("outputRange must contain only numbers");
  const o = r?.outputType;
  if (n.some((s) => typeof s == "boolean")) {
    if (!n.every((s) => typeof s == "boolean"))
      throw new TypeError("Boolean outputRange must contain only booleans");
    return eg({
      input: e,
      inputRange: t,
      outputRange: n,
      options: r
    });
  }
  if (n.some((s) => typeof s == "string")) {
    if (!n.every((s) => typeof s == "string" || typeof s == "number"))
      throw new TypeError("outputRange must contain only numbers, or supported scale, translate, and rotate strings");
    try {
      return wR({
        input: e,
        inputRange: t,
        outputRange: n,
        options: r,
        outputType: o
      });
    } catch (s) {
      if (!n.every((u) => typeof u == "string") || !n.some((u) => {
        try {
          return kS(u, o), !1;
        } catch (c) {
          return c instanceof bp;
        }
      }))
        throw s;
      return eg({
        input: e,
        inputRange: t,
        outputRange: n,
        options: r
      });
    }
  }
  if (n.every((s) => Array.isArray(s)))
    return xR({ input: e, inputRange: t, outputRange: n, options: r });
  if (!n.every((s) => typeof s == "number"))
    throw new TypeError("outputRange must contain only numbers, numeric tuples, or supported scale, translate, and rotate strings");
  return tg("outputRange", n), Pp({ input: e, inputRange: t, outputRange: n, options: r });
}
var bR = !1, ER = 0, kR = 2, PR = (e) => {
  if (typeof e != "number" || !Number.isFinite(e) || e < 0)
    throw new TypeError(`defaultPremountInSeconds must be a finite, non-negative number, but got ${String(e)}.`);
}, IR = "The delayRender was called:", TR = "Retries left: ", RR = "- Rendering the frame will be retried.", FR = "handle was cleared after", MR = ({
  schema: e,
  key: t,
  value: n
}) => {
  const r = e[t];
  if (!r)
    throw new Error("Key " + JSON.stringify(t) + " not found in schema");
  if (typeof n != "string")
    throw new Error("Value must be a string, but is " + JSON.stringify(n));
  if (r.type !== "enum")
    throw new Error("Key " + JSON.stringify(t) + " is not an enum");
  if (!r.variants[n])
    throw new Error("Value for " + JSON.stringify(t) + " must be one of " + Object.keys(r.variants).map((a) => JSON.stringify(a)).join(", ") + ", got " + JSON.stringify(n));
  const i = Object.keys(r.variants).filter((a) => a !== n), s = /* @__PURE__ */ new Set();
  for (const a of i) {
    const u = r.variants[a], c = Object.keys(u);
    for (const d of c)
      s.add(d);
  }
  return [...s];
}, df = [], Ac = /* @__PURE__ */ new Map(), NR = (e) => {
  const t = Ac.get(e);
  if (t)
    return t;
  const n = fetch(e).then((r) => {
    if (!r.ok)
      throw new Error(`Failed to load font ${JSON.stringify(e)}: ${r.status} ${r.statusText}`);
    return r.arrayBuffer();
  }).catch((r) => {
    throw Ac.delete(e), r;
  });
  return Ac.set(e, n), n;
}, $R = (e) => {
  df.some((t) => t.ascentOverride === e.ascentOverride && t.descentOverride === e.descentOverride && t.display === e.display && t.featureSettings === e.featureSettings && t.fontFamily === e.fontFamily && t.fontUrl === e.fontUrl && t.format === e.format && t.lineGapOverride === e.lineGapOverride && t.style === e.style && t.weight === e.weight && t.stretch === e.stretch && t.unicodeRange === e.unicodeRange && t.variant === e.variant) || df.push(e);
}, _R = () => df.slice(), $u = "remotion-date:", Ll = "remotion-file:", AR = ({
  data: e,
  indent: t,
  staticBase: n
}) => {
  let r = !1, o = !1, i = !1, s = !1;
  try {
    return { serializedString: JSON.stringify(e, function(u, c) {
      const d = this[u];
      return d instanceof Date ? (r = !0, `${$u}${d.toISOString()}`) : d instanceof Map ? (i = !0, c) : d instanceof Set ? (s = !0, c) : typeof d == "string" && n !== null && n !== "" && d.startsWith(n) ? (o = !0, `${Ll}${d.replace(n + "/", "")}`) : c;
    }, t), customDateUsed: r, customFileUsed: o, mapUsed: i, setUsed: s };
  } catch (a) {
    throw new Error("Could not serialize the passed input props to JSON: " + a.message);
  }
}, LR = (e) => {
  const t = e.replace(Ll, "");
  let n = t;
  try {
    n = t.split("/").map(decodeURIComponent).join("/");
  } catch {
  }
  const r = window.remotion_staticFiles?.find((o) => o.name === n);
  return r ? r.src : `${window.remotion_staticBase}/${t}`;
}, OR = (e) => JSON.parse(e, (t, n) => typeof n == "string" && n.startsWith($u) ? new Date(n.replace($u, "")) : typeof n == "string" && n.startsWith(Ll) ? LR(n) : n), jR = {
  "style.transformOrigin": {
    type: "transform-origin",
    step: 1,
    default: "50% 50%",
    description: "Transform origin"
  },
  "style.translate": {
    type: "translate",
    step: 1,
    default: "0px 0px",
    description: "Offset"
  },
  "style.scale": {
    type: "scale",
    max: 100,
    step: 0.01,
    default: 1,
    description: "Scale",
    defaultKeyframeOutput: "perceptual-scale"
  },
  "style.rotate": {
    type: "rotation-css",
    step: 1,
    default: "0deg",
    description: "Rotation"
  },
  "style.opacity": {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: 1,
    description: "Opacity",
    hiddenFromList: !1
  }
}, DR = {
  "style.borderWidth": {
    type: "number",
    default: void 0,
    min: 0,
    step: 1,
    description: "Border width",
    hiddenFromList: !1
  },
  "style.borderStyle": {
    type: "enum",
    default: "none",
    description: "Border style",
    variants: {
      none: {},
      hidden: {},
      solid: {},
      dashed: {},
      dotted: {},
      double: {},
      groove: {},
      ridge: {},
      inset: {},
      outset: {}
    }
  },
  "style.borderColor": {
    type: "color",
    default: void 0,
    description: "Border color"
  }
}, VR = {
  "style.borderRadius": {
    type: "number",
    default: 0,
    min: 0,
    step: 1,
    description: "Border radius",
    hiddenFromList: !1,
    keyframable: !0
  },
  "style.borderTopLeftRadius": {
    type: "number",
    default: 0,
    min: 0,
    step: 1,
    description: "Top left radius",
    hiddenFromList: !1
  },
  "style.borderTopRightRadius": {
    type: "number",
    default: 0,
    min: 0,
    step: 1,
    description: "Top right radius",
    hiddenFromList: !1
  },
  "style.borderBottomRightRadius": {
    type: "number",
    default: 0,
    min: 0,
    step: 1,
    description: "Bottom right radius",
    hiddenFromList: !1
  },
  "style.borderBottomLeftRadius": {
    type: "number",
    default: 0,
    min: 0,
    step: 1,
    description: "Bottom left radius",
    hiddenFromList: !1
  }
}, zR = {
  "style.backgroundColor": {
    type: "color",
    default: "transparent",
    description: "Color"
  }
}, BR = {
  premountFor: {
    type: "number",
    default: void 0,
    description: "Premount For",
    min: 0,
    step: 1,
    hiddenFromList: !1,
    keyframable: !1
  },
  postmountFor: {
    type: "number",
    default: 0,
    min: 0,
    step: 1,
    hiddenFromList: !0,
    keyframable: !1
  }
}, UR = {
  ...BR
}, WR = {
  cropLeft: {
    type: "number",
    default: 0,
    description: "Crop left",
    min: 0,
    max: 1,
    step: 0.01,
    hiddenFromList: !1,
    keyframable: !0
  },
  cropRight: {
    type: "number",
    default: 0,
    description: "Crop right",
    min: 0,
    max: 1,
    step: 0.01,
    hiddenFromList: !1,
    keyframable: !0
  },
  cropTop: {
    type: "number",
    default: 0,
    description: "Crop top",
    min: 0,
    max: 1,
    step: 0.01,
    hiddenFromList: !1,
    keyframable: !0
  },
  cropBottom: {
    type: "number",
    default: 0,
    description: "Crop bottom",
    min: 0,
    max: 1,
    step: 0.01,
    hiddenFromList: !1,
    keyframable: !0
  }
}, qR = WR, HR = {
  ...qR,
  ...jR,
  ...zR,
  ...DR,
  ...VR,
  ...UR
}, KR = {
  type: "boolean",
  default: !1,
  description: "Hidden"
}, GR = {
  type: "hidden"
}, YR = {
  type: "hidden"
}, IS = {
  type: "number",
  default: void 0,
  min: 1,
  step: 1,
  hiddenFromList: !0
}, TS = {
  type: "number",
  default: 0,
  step: 1,
  hiddenFromList: !0
}, RS = {
  type: "number",
  default: 0,
  min: 0,
  step: 1,
  hiddenFromList: !0
};
({
  ...TS
}, {
  ...IS
}), {
  ...RS
};
var QR = {
  type: "number",
  default: null,
  step: 1,
  hiddenFromList: !0
}, JR = {
  type: "number",
  default: 1,
  min: 0.01,
  step: 0.1,
  description: "Playback rate",
  hiddenFromList: !1,
  keyframable: !1
}, ZR = {
  durationInFrames: IS,
  from: TS,
  trimBefore: RS,
  playbackRate: JR,
  freeze: QR,
  hidden: KR,
  name: YR,
  showInTimeline: GR
}, FS = {
  ...ZR,
  layout: {
    type: "enum",
    default: "absolute-fill",
    description: "Layout",
    variants: {
      "absolute-fill": HR,
      none: {}
    }
  }
};
({
  ...FS.layout
});
var zt = "[-+]?\\d*\\.?\\d+", Ta = zt + "%";
function Ra(...e) {
  return "\\(\\s*(" + e.join(")\\s*,\\s*(") + ")\\s*\\)";
}
var Fa = "(?:none|[-+]?\\d*\\.?\\d+(?:%|deg|rad|grad|turn)?)";
function Ii(e) {
  return new RegExp(e + "\\(\\s*(" + Fa + ")\\s+(" + Fa + ")\\s+(" + Fa + ")(?:\\s*\\/\\s*(" + Fa + "))?\\s*\\)");
}
var Ze = {
  rgb: void 0,
  rgba: void 0,
  hsl: void 0,
  hsla: void 0,
  hex3: void 0,
  hex4: void 0,
  hex5: void 0,
  hex6: void 0,
  hex8: void 0,
  oklch: void 0,
  oklab: void 0,
  lab: void 0,
  lch: void 0,
  hwb: void 0
};
function XR() {
  return Ze.rgb === void 0 && (Ze.rgb = new RegExp("rgb" + Ra(zt, zt, zt)), Ze.rgba = new RegExp("rgba" + Ra(zt, zt, zt, zt)), Ze.hsl = new RegExp("hsl" + Ra(zt, Ta, Ta)), Ze.hsla = new RegExp("hsla" + Ra(zt, Ta, Ta, zt)), Ze.hex3 = /^#([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})$/, Ze.hex4 = /^#([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})$/, Ze.hex6 = /^#([0-9a-fA-F]{6})$/, Ze.hex8 = /^#([0-9a-fA-F]{8})$/, Ze.oklch = Ii("oklch"), Ze.oklab = Ii("oklab"), Ze.lab = Ii("lab"), Ze.lch = Ii("lch"), Ze.hwb = Ii("hwb")), Ze;
}
function jo(e, t, n) {
  return n < 0 && (n += 1), n > 1 && (n -= 1), n < 1 / 6 ? e + (t - e) * 6 * n : n < 1 / 2 ? t : n < 2 / 3 ? e + (t - e) * (2 / 3 - n) * 6 : e;
}
function ng(e, t, n) {
  const r = n < 0.5 ? n * (1 + t) : n + t - n * t, o = 2 * n - r, i = jo(o, r, e + 1 / 3), s = jo(o, r, e), a = jo(o, r, e - 1 / 3);
  return Math.round(i * 255) << 24 | Math.round(s * 255) << 16 | Math.round(a * 255) << 8;
}
function co(e) {
  const t = Number.parseInt(e, 10);
  return t < 0 ? 0 : t > 255 ? 255 : t;
}
function rg(e) {
  return (Number.parseFloat(e) % 360 + 360) % 360 / 360;
}
function og(e) {
  const t = Number.parseFloat(e);
  return t < 0 ? 0 : t > 1 ? 255 : Math.round(t * 255);
}
function Ma(e) {
  const t = Number.parseFloat(e);
  return t < 0 ? 0 : t > 100 ? 1 : t / 100;
}
function Pt(e, t) {
  return e === "none" ? 0 : e.endsWith("%") ? Number.parseFloat(e) / 100 * t : Number.parseFloat(e);
}
function Lc(e) {
  if (e === "none")
    return 0;
  let t = Number.parseFloat(e);
  e.endsWith("grad") ? t *= 0.9 : e.endsWith("rad") ? t = t * 180 / Math.PI : e.endsWith("turn") && (t *= 360);
  const n = t % 360;
  return n < 0 ? (n + 360) % 360 : n;
}
function Ti(e) {
  return e === void 0 || e === "none" ? 1 : e.endsWith("%") ? Math.max(0, Math.min(1, Number.parseFloat(e) / 100)) : Math.max(0, Math.min(1, Number.parseFloat(e)));
}
function Do(e) {
  return e <= 31308e-7 ? 12.92 * e : 1.055 * e ** (1 / 2.4) - 0.055;
}
function Na(e) {
  return Math.max(0, Math.min(1, e));
}
function Ri(e, t, n, r) {
  const o = Math.round(Na(e) * 255), i = Math.round(Na(t) * 255), s = Math.round(Na(n) * 255), a = Math.round(Na(r) * 255);
  return (o << 24 | i << 16 | s << 8 | a) >>> 0;
}
function ig(e, t, n) {
  const r = e + 0.3963377774 * t + 0.2158037573 * n, o = e - 0.1055613458 * t - 0.0638541728 * n, i = e - 0.0894841775 * t - 1.291485548 * n, s = r * r * r, a = o * o * o, u = i * i * i, c = 4.0767416621 * s - 3.3077115913 * a + 0.2309699292 * u, d = -1.2684380046 * s + 2.6097574011 * a - 0.3413193965 * u, m = -0.0041960863 * s - 0.7034186147 * a + 1.707614701 * u;
  return [Do(c), Do(d), Do(m)];
}
function sg(e, t, n) {
  const r = 0.008856451679035631, o = 24389 / 27, i = 0.95047, s = 1, a = 1.08883, u = (e + 16) / 116, c = t / 500 + u, d = u - n / 200, m = c * c * c, f = d * d * d, v = m > r ? m : (116 * c - 16) / o, h = e > o * r ? ((e + 16) / 116) ** 3 : e / o, w = f > r ? f : (116 * d - 16) / o, x = v * i, g = h * s, p = w * a, y = 3.2404542 * x - 1.5371385 * g - 0.4985314 * p, C = -0.969266 * x + 1.8760108 * g + 0.041556 * p, b = 0.0556434 * x - 0.2040259 * g + 1.0572252 * p;
  return [Do(y), Do(C), Do(b)];
}
function e3(e, t, n) {
  if (t + n >= 1) {
    const c = t / (t + n);
    return [c, c, c];
  }
  const r = 1, o = 0, i = jo(o, r, e + 1 / 3), s = jo(o, r, e), a = jo(o, r, e - 1 / 3), u = 1 - t - n;
  return [i * u + t, s * u + t, a * u + t];
}
var ff = {
  transparent: 0,
  aliceblue: 4042850303,
  antiquewhite: 4209760255,
  aqua: 16777215,
  aquamarine: 2147472639,
  azure: 4043309055,
  beige: 4126530815,
  bisque: 4293182719,
  black: 255,
  blanchedalmond: 4293643775,
  blue: 65535,
  blueviolet: 2318131967,
  brown: 2771004159,
  burlywood: 3736635391,
  burntsienna: 3934150143,
  cadetblue: 1604231423,
  chartreuse: 2147418367,
  chocolate: 3530104575,
  coral: 4286533887,
  cornflowerblue: 1687547391,
  cornsilk: 4294499583,
  crimson: 3692313855,
  cyan: 16777215,
  darkblue: 35839,
  darkcyan: 9145343,
  darkgoldenrod: 3095792639,
  darkgray: 2846468607,
  darkgreen: 6553855,
  darkgrey: 2846468607,
  darkkhaki: 3182914559,
  darkmagenta: 2332068863,
  darkolivegreen: 1433087999,
  darkorange: 4287365375,
  darkorchid: 2570243327,
  darkred: 2332033279,
  darksalmon: 3918953215,
  darkseagreen: 2411499519,
  darkslateblue: 1211993087,
  darkslategray: 793726975,
  darkslategrey: 793726975,
  darkturquoise: 13554175,
  darkviolet: 2483082239,
  deeppink: 4279538687,
  deepskyblue: 12582911,
  dimgray: 1768516095,
  dimgrey: 1768516095,
  dodgerblue: 512819199,
  firebrick: 2988581631,
  floralwhite: 4294635775,
  forestgreen: 579543807,
  fuchsia: 4278255615,
  gainsboro: 3705462015,
  ghostwhite: 4177068031,
  gold: 4292280575,
  goldenrod: 3668254975,
  gray: 2155905279,
  green: 8388863,
  greenyellow: 2919182335,
  grey: 2155905279,
  honeydew: 4043305215,
  hotpink: 4285117695,
  indianred: 3445382399,
  indigo: 1258324735,
  ivory: 4294963455,
  khaki: 4041641215,
  lavender: 3873897215,
  lavenderblush: 4293981695,
  lawngreen: 2096890111,
  lemonchiffon: 4294626815,
  lightblue: 2916673279,
  lightcoral: 4034953471,
  lightcyan: 3774873599,
  lightgoldenrodyellow: 4210742015,
  lightgray: 3553874943,
  lightgreen: 2431553791,
  lightgrey: 3553874943,
  lightpink: 4290167295,
  lightsalmon: 4288707327,
  lightseagreen: 548580095,
  lightskyblue: 2278488831,
  lightslategray: 2005441023,
  lightslategrey: 2005441023,
  lightsteelblue: 2965692159,
  lightyellow: 4294959359,
  lime: 16711935,
  limegreen: 852308735,
  linen: 4210091775,
  magenta: 4278255615,
  maroon: 2147483903,
  mediumaquamarine: 1724754687,
  mediumblue: 52735,
  mediumorchid: 3126187007,
  mediumpurple: 2473647103,
  mediumseagreen: 1018393087,
  mediumslateblue: 2070474495,
  mediumspringgreen: 16423679,
  mediumturquoise: 1221709055,
  mediumvioletred: 3340076543,
  midnightblue: 421097727,
  mintcream: 4127193855,
  mistyrose: 4293190143,
  moccasin: 4293178879,
  navajowhite: 4292783615,
  navy: 33023,
  oldlace: 4260751103,
  olive: 2155872511,
  olivedrab: 1804477439,
  orange: 4289003775,
  orangered: 4282712319,
  orchid: 3664828159,
  palegoldenrod: 4008225535,
  palegreen: 2566625535,
  paleturquoise: 2951671551,
  palevioletred: 3681588223,
  papayawhip: 4293907967,
  peachpuff: 4292524543,
  peru: 3448061951,
  pink: 4290825215,
  plum: 3718307327,
  powderblue: 2967529215,
  purple: 2147516671,
  rebeccapurple: 1714657791,
  red: 4278190335,
  rosybrown: 3163525119,
  royalblue: 1097458175,
  saddlebrown: 2336560127,
  salmon: 4202722047,
  sandybrown: 4104413439,
  seagreen: 780883967,
  seashell: 4294307583,
  sienna: 2689740287,
  silver: 3233857791,
  skyblue: 2278484991,
  slateblue: 1784335871,
  slategray: 1887473919,
  slategrey: 1887473919,
  snow: 4294638335,
  springgreen: 16744447,
  steelblue: 1182971135,
  tan: 3535047935,
  teal: 8421631,
  thistle: 3636451583,
  tomato: 4284696575,
  turquoise: 1088475391,
  violet: 4001558271,
  wheat: 4125012991,
  white: 4294967295,
  whitesmoke: 4126537215,
  yellow: 4294902015,
  yellowgreen: 2597139199
};
function t3(e) {
  const t = XR();
  let n;
  if (t.hex6 && (n = t.hex6.exec(e)))
    return Number.parseInt(n[1] + "ff", 16) >>> 0;
  if (ff[e] !== void 0)
    return ff[e];
  if (t.rgb && (n = t.rgb.exec(e)))
    return (co(n[1]) << 24 | co(n[2]) << 16 | co(n[3]) << 8 | 255) >>> 0;
  if (t.rgba && (n = t.rgba.exec(e)))
    return (co(n[1]) << 24 | co(n[2]) << 16 | co(n[3]) << 8 | og(n[4])) >>> 0;
  if (t.hex3 && (n = t.hex3.exec(e)))
    return Number.parseInt(n[1] + n[1] + n[2] + n[2] + n[3] + n[3] + "ff", 16) >>> 0;
  if (t.hex8 && (n = t.hex8.exec(e)))
    return Number.parseInt(n[1], 16) >>> 0;
  if (t.hex4 && (n = t.hex4.exec(e)))
    return Number.parseInt(n[1] + n[1] + n[2] + n[2] + n[3] + n[3] + n[4] + n[4], 16) >>> 0;
  if (t.hsl && (n = t.hsl.exec(e)))
    return (ng(rg(n[1]), Ma(n[2]), Ma(n[3])) | 255) >>> 0;
  if (t.hsla && (n = t.hsla.exec(e)))
    return (ng(rg(n[1]), Ma(n[2]), Ma(n[3])) | og(n[4])) >>> 0;
  if (t.oklch && (n = t.oklch.exec(e))) {
    const r = Pt(n[1], 1), o = Pt(n[2], 0.4), i = Lc(n[3]), s = Ti(n[4]), a = i * Math.PI / 180, [u, c, d] = ig(r, o * Math.cos(a), o * Math.sin(a));
    return Ri(u, c, d, s);
  }
  if (t.oklab && (n = t.oklab.exec(e))) {
    const r = Pt(n[1], 1), o = Pt(n[2], 0.4), i = Pt(n[3], 0.4), s = Ti(n[4]), [a, u, c] = ig(r, o, i);
    return Ri(a, u, c, s);
  }
  if (t.lab && (n = t.lab.exec(e))) {
    const r = Pt(n[1], 100), o = Pt(n[2], 125), i = Pt(n[3], 125), s = Ti(n[4]), [a, u, c] = sg(r, o, i);
    return Ri(a, u, c, s);
  }
  if (t.lch && (n = t.lch.exec(e))) {
    const r = Pt(n[1], 100), o = Pt(n[2], 150), i = Lc(n[3]), s = Ti(n[4]), a = i * Math.PI / 180, [u, c, d] = sg(r, o * Math.cos(a), o * Math.sin(a));
    return Ri(u, c, d, s);
  }
  if (t.hwb && (n = t.hwb.exec(e))) {
    const r = Lc(n[1]), o = Pt(n[2], 1), i = Pt(n[3], 1), s = Ti(n[4]), [a, u, c] = e3(r / 360, o, i);
    return Ri(a, u, c, s);
  }
  throw new Error(`invalid color string ${e} provided`);
}
function n3(e) {
  const t = t3(e);
  return (t << 24 | t >>> 8) >>> 0;
}
var r3 = [
  "4444-xq",
  "4444",
  "hq",
  "standard",
  "light",
  "proxy"
], o3 = [1, 1, 1], i3 = (e) => {
  const t = e.trim().split(/\s+/);
  if (t.length < 1 || t.length > 3 || t[0] === "")
    return null;
  const n = t.map((s) => Number(s));
  if (!n.every((s) => Number.isFinite(s)))
    return null;
  const r = n[0], o = n[1] ?? r, i = n[2] ?? 1;
  return [r, o, i];
}, s3 = (e) => typeof e == "number" ? Number.isFinite(e) ? [e, e, 1] : null : typeof e == "string" ? i3(e) : null, a3 = (e) => s3(e) ?? o3, u3 = ([e, t, n]) => {
  const r = Xa(e), o = Xa(t), i = Xa(n);
  return r === o && i === 1 ? r : i === 1 ? `${r} ${o}` : `${r} ${o} ${i}`;
};
function l3(e) {
  return !!e;
}
var ag = [
  "h264",
  "h265",
  "vp8",
  "vp9",
  "av1",
  "mp3",
  "aac",
  "wav",
  "prores",
  "h264-mkv",
  "h264-ts",
  "gif"
];
function c3(e, t, n) {
  if (!(typeof e > "u")) {
    if (typeof e != "string")
      throw new TypeError(`The "${n}" prop ${t} must be a string, but you passed a value of type ${typeof e}.`);
    if (!ag.includes(e))
      throw new Error(`The "${n}" prop ${t} must be one of ${ag.join(", ")}, but you passed ${e}.`);
  }
}
var d3 = (e, t, n) => {
  if (e) {
    if (typeof e != "object")
      throw new Error(`"${t}" must be an object, but you passed a value of type ${typeof e}`);
    if (Array.isArray(e))
      throw new Error(`"${t}" must be an object, an array was passed ${n ? `for composition "${n}"` : ""}`);
  }
};
function f3(e, t, n) {
  if (typeof e != "number")
    throw new Error(`The "${t}" prop ${n} must be a number, but you passed a value of type ${typeof e}`);
  if (isNaN(e))
    throw new TypeError(`The "${t}" prop ${n} must not be NaN, but is NaN.`);
  if (!Number.isFinite(e))
    throw new TypeError(`The "${t}" prop ${n} must be finite, but is ${e}.`);
  if (e % 1 !== 0)
    throw new TypeError(`The "${t}" prop ${n} must be an integer, but is ${e}.`);
  if (e <= 0)
    throw new TypeError(`The "${t}" prop ${n} must be positive, but got ${e}.`);
}
function m3(e, t) {
  const { allowFloats: n, component: r } = t;
  if (typeof e > "u")
    throw new Error(`The "durationInFrames" prop ${r} is missing.`);
  if (typeof e != "number")
    throw new Error(`The "durationInFrames" prop ${r} must be a number, but you passed a value of type ${typeof e}`);
  if (e <= 0)
    throw new TypeError(`The "durationInFrames" prop ${r} must be positive, but got ${e}.`);
  if (!Number.isFinite(e))
    throw new TypeError(`The "durationInFrames" prop ${r} must be finite, but got ${e}.`);
  if (!n && e % 1 !== 0)
    throw new TypeError(`The "durationInFrames" prop ${r} must be an integer, but got ${e}.`);
}
var p3 = ({
  frame: e,
  playbackRate: t,
  startFrom: n
}) => PS(e, [-1, n, n + 1], [-1, n, n + t]), h3 = (e) => typeof window > "u" || e.startsWith("http://") || e.startsWith("https://") || e.startsWith("file://") || e.startsWith("blob:") || e.startsWith("data:") ? e : new URL(e, document.baseURI).href, v3 = ({
  src: e,
  transparent: t,
  currentTime: n,
  toneMapped: r
}) => `http://localhost:${window.remotion_proxyPort}/proxy?src=${encodeURIComponent(h3(e))}&time=${encodeURIComponent(Math.max(0, n))}&transparent=${String(t)}&toneMapped=${String(r)}`, Go = {
  DEFAULT_PREMOUNT_IN_SECONDS: ER,
  DEFAULT_STUDIO_PREMOUNT_IN_SECONDS: kR,
  DEFAULT_SEQUENCE_ACTIVITY_LIMIT: XT,
  validateDefaultPremountInSeconds: PR,
  evaluateSourceNumericValue: Er,
  evaluateSourcePropStatuses: ZT,
  processColor: n3,
  truthy: l3,
  validateFps: Sp,
  validateDimension: f3,
  validateDurationInFrames: m3,
  validateDefaultAndInputProps: d3,
  validateFrame: SS,
  serializeJSONWithSpecialTypes: AR,
  bundleName: "bundle.js",
  bundleMapName: "bundle.js.map",
  deserializeJSONWithSpecialTypes: OR,
  DELAY_RENDER_CALLSTACK_TOKEN: IR,
  DELAY_RENDER_RETRY_TOKEN: RR,
  DELAY_RENDER_CLEAR_TOKEN: FR,
  DELAY_RENDER_ATTEMPT_TOKEN: TR,
  getOffthreadVideoSource: v3,
  getExpectedMediaFrameUncorrected: p3,
  ENABLE_V5_BREAKING_CHANGES: bR,
  MIN_NODE_VERSION: 16,
  MIN_BUN_VERSION: "1.0.3",
  MIN_ESLINT_VERSION: "7.15.0",
  colorNames: ff,
  DATE_TOKEN: $u,
  FILE_TOKEN: Ll,
  validateCodec: c3,
  proResProfileOptions: r3,
  findPropsToDelete: MR,
  sequenceSchema: FS,
  parseScaleValue: a3,
  serializeScaleValue: u3,
  getRegisteredFontFaces: _R,
  registerFontFace: $R,
  fetchFontData: NR
};
if (typeof l.createContext != "function") {
  const e = [
    'Remotion requires React.createContext, but it is "undefined".',
    'If you are in a React Server Component, turn it into a client component by adding "use client" at the top of the file.',
    "",
    "Before:",
    '  import {Player} from "@remotion/player";',
    "",
    "After:",
    '  "use client";',
    '  import {Player} from "@remotion/player";'
  ];
  throw new Error(e.join(`
`));
}
var ze = 25, mf = 16, g3 = () => /* @__PURE__ */ S.jsx("svg", {
  width: ze,
  height: ze,
  viewBox: "0 0 25 25",
  fill: "none",
  children: /* @__PURE__ */ S.jsx("path", {
    d: "M8 6.375C7.40904 8.17576 7.06921 10.2486 7.01438 12.3871C6.95955 14.5255 7.19163 16.6547 7.6875 18.5625C9.95364 18.2995 12.116 17.6164 14.009 16.5655C15.902 15.5147 17.4755 14.124 18.6088 12.5C17.5158 10.8949 15.9949 9.51103 14.1585 8.45082C12.3222 7.3906 10.2174 6.68116 8 6.375Z",
    fill: "white",
    stroke: "white",
    strokeWidth: "6.25",
    strokeLinejoin: "round"
  })
}), y3 = () => /* @__PURE__ */ S.jsxs("svg", {
  viewBox: "0 0 100 100",
  width: ze,
  height: ze,
  children: [
    /* @__PURE__ */ S.jsx("rect", {
      x: "25",
      y: "20",
      width: "20",
      height: "60",
      fill: "#fff",
      ry: "5",
      rx: "5"
    }),
    /* @__PURE__ */ S.jsx("rect", {
      x: "55",
      y: "20",
      width: "20",
      height: "60",
      fill: "#fff",
      ry: "5",
      rx: "5"
    })
  ]
}), w3 = ({
  isFullscreen: e
}) => {
  const r = e ? 0 : 3, o = e ? 6 * 1.6 : 6 / 2, i = e ? 6 * 1.6 : 6 * 2;
  return /* @__PURE__ */ S.jsxs("svg", {
    viewBox: "0 0 32 32",
    height: mf,
    width: mf,
    children: [
      /* @__PURE__ */ S.jsx("path", {
        d: `
				M ${r} ${i}
				L ${o} ${o}
				L ${i} ${r}
				`,
        stroke: "#fff",
        strokeWidth: 6,
        fill: "none"
      }),
      /* @__PURE__ */ S.jsx("path", {
        d: `
				M ${32 - r} ${i}
				L ${32 - o} ${o}
				L ${32 - i} ${r}
				`,
        stroke: "#fff",
        strokeWidth: 6,
        fill: "none"
      }),
      /* @__PURE__ */ S.jsx("path", {
        d: `
				M ${r} ${32 - i}
				L ${o} ${32 - o}
				L ${i} ${32 - r}
				`,
        stroke: "#fff",
        strokeWidth: 6,
        fill: "none"
      }),
      /* @__PURE__ */ S.jsx("path", {
        d: `
				M ${32 - r} ${32 - i}
				L ${32 - o} ${32 - o}
				L ${32 - i} ${32 - r}
				`,
        stroke: "#fff",
        strokeWidth: 6,
        fill: "none"
      })
    ]
  });
}, S3 = () => /* @__PURE__ */ S.jsx("svg", {
  width: ze,
  height: ze,
  viewBox: "0 0 24 24",
  children: /* @__PURE__ */ S.jsx("path", {
    d: "M3.63 3.63a.996.996 0 000 1.41L7.29 8.7 7 9H4c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h3l3.29 3.29c.63.63 1.71.18 1.71-.71v-4.17l4.18 4.18c-.49.37-1.02.68-1.6.91-.36.15-.58.53-.58.92 0 .72.73 1.18 1.39.91.8-.33 1.55-.77 2.22-1.31l1.34 1.34a.996.996 0 101.41-1.41L5.05 3.63c-.39-.39-1.02-.39-1.42 0zM19 12c0 .82-.15 1.61-.41 2.34l1.53 1.53c.56-1.17.88-2.48.88-3.87 0-3.83-2.4-7.11-5.78-8.4-.59-.23-1.22.23-1.22.86v.19c0 .38.25.71.61.85C17.18 6.54 19 9.06 19 12zm-8.71-6.29l-.17.17L12 7.76V6.41c0-.89-1.08-1.33-1.71-.7zM16.5 12A4.5 4.5 0 0014 7.97v1.79l2.48 2.48c.01-.08.02-.16.02-.24z",
    fill: "#fff"
  })
}), x3 = () => /* @__PURE__ */ S.jsx("svg", {
  width: ze,
  height: ze,
  viewBox: "0 0 24 24",
  children: /* @__PURE__ */ S.jsx("path", {
    d: "M3 10v4c0 .55.45 1 1 1h3l3.29 3.29c.63.63 1.71.18 1.71-.71V6.41c0-.89-1.08-1.34-1.71-.71L7 9H4c-.55 0-1 .45-1 1zm13.5 2A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 4.45v.2c0 .38.25.71.6.85C17.18 6.53 19 9.06 19 12s-1.82 5.47-4.4 6.5c-.36.14-.6.47-.6.85v.2c0 .63.63 1.07 1.21.85C18.6 19.11 21 15.84 21 12s-2.4-7.11-5.79-8.4c-.58-.23-1.21.22-1.21.85z",
    fill: "#fff"
  })
}), ug = "__remotion_buffering_indicator", lg = "__remotion_buffering_animation", C3 = {
  width: ze,
  height: ze,
  overflow: "hidden",
  lineHeight: "normal",
  fontSize: "inherit"
}, b3 = {
  width: 14,
  height: 14,
  overflow: "hidden",
  lineHeight: "normal",
  fontSize: "inherit"
}, E3 = ({ type: e, color: t = "white" }) => {
  const n = e === "player" ? C3 : b3;
  return /* @__PURE__ */ S.jsxs(S.Fragment, {
    children: [
      /* @__PURE__ */ S.jsx("style", {
        type: "text/css",
        children: `
				@keyframes ${lg} {
          0% {
            rotate: 0deg;
          }
          100% {
            rotate: 360deg;
          }
        }
        
        .${ug} {
            animation: ${lg} 1s linear infinite;
        }        
			`
      }),
      /* @__PURE__ */ S.jsx("div", {
        style: n,
        children: /* @__PURE__ */ S.jsx("svg", {
          viewBox: e === "player" ? "0 0 22 22" : "0 0 18 18",
          style: n,
          className: ug,
          children: /* @__PURE__ */ S.jsx("path", {
            d: e === "player" ? "M 11 4 A 7 7 0 0 1 15.1145 16.66312" : "M 9 2 A 7 7 0 0 1 13.1145 14.66312",
            stroke: t,
            strokeLinecap: "round",
            fill: "none",
            strokeWidth: 3
          })
        })
      })
    ]
  });
}, k3 = ({
  currentSize: e,
  width: t,
  height: n,
  compositionWidth: r,
  compositionHeight: o
}) => t !== void 0 && n === void 0 ? {
  aspectRatio: [r, o].join("/")
} : n !== void 0 && t === void 0 ? {
  aspectRatio: [r, o].join("/")
} : e ? {
  width: r,
  height: o
} : {
  width: r,
  height: o
}, MS = ({
  previewSize: e,
  compositionWidth: t,
  compositionHeight: n,
  canvasSize: r
}) => {
  const o = G.calculateScale({
    canvasSize: r,
    compositionHeight: n,
    compositionWidth: t,
    previewSize: e
  }), i = 0 - (1 - o) / 2, s = i * t, a = i * n, u = t * o, c = n * o, d = r.width / 2 - u / 2, m = r.height / 2 - c / 2;
  return {
    centerX: d,
    centerY: m,
    xCorrection: s,
    yCorrection: a,
    scale: o
  };
}, NS = ({
  config: e,
  style: t,
  canvasSize: n,
  overflowVisible: r,
  layout: o
}) => e ? {
  position: "relative",
  overflow: r ? "visible" : "hidden",
  ...k3({
    compositionHeight: e.height,
    compositionWidth: e.width,
    currentSize: n,
    height: t?.height,
    width: t?.width
  }),
  opacity: o ? 1 : 0,
  ...t
} : {}, $S = ({
  config: e,
  layout: t,
  scale: n,
  overflowVisible: r
}) => e ? t ? {
  position: "absolute",
  width: e.width,
  height: e.height,
  display: "flex",
  transform: `scale(${n})`,
  marginLeft: t.xCorrection,
  marginTop: t.yCorrection,
  overflow: r ? "visible" : "hidden"
} : {
  position: "absolute",
  width: e.width,
  height: e.height,
  display: "flex",
  transform: `scale(${n})`,
  overflow: r ? "visible" : "hidden"
} : {}, _S = ({
  layout: e,
  scale: t,
  config: n,
  overflowVisible: r
}) => {
  if (!n)
    return {};
  if (!e)
    return {
      width: n.width * t,
      height: n.height * t,
      display: "flex",
      flexDirection: "column",
      position: "absolute",
      overflow: r ? "visible" : "hidden"
    };
  const { centerX: o, centerY: i } = e;
  return {
    width: n.width * t,
    height: n.height * t,
    display: "flex",
    flexDirection: "column",
    position: "absolute",
    left: o,
    top: i,
    overflow: r ? "visible" : "hidden"
  };
}, cg = l.createContext(null), P3 = l.createContext(null), AS = D.createContext(void 0), LS = D.createContext(void 0);
class I3 {
  constructor() {
    ue(this, "listeners", {
      ended: [],
      error: [],
      pause: [],
      play: [],
      ratechange: [],
      scalechange: [],
      seeked: [],
      timeupdate: [],
      frameupdate: [],
      fullscreenchange: [],
      volumechange: [],
      mutechange: [],
      waiting: [],
      resume: []
    });
    ue(this, "dispatchSeek", (t) => {
      this.dispatchEvent("seeked", {
        frame: t
      });
    });
    ue(this, "dispatchVolumeChange", (t) => {
      this.dispatchEvent("volumechange", {
        volume: t
      });
    });
    ue(this, "dispatchPause", () => {
      this.dispatchEvent("pause", void 0);
    });
    ue(this, "dispatchPlay", () => {
      this.dispatchEvent("play", void 0);
    });
    ue(this, "dispatchEnded", () => {
      this.dispatchEvent("ended", void 0);
    });
    ue(this, "dispatchRateChange", (t) => {
      this.dispatchEvent("ratechange", {
        playbackRate: t
      });
    });
    ue(this, "dispatchScaleChange", (t) => {
      this.dispatchEvent("scalechange", {
        scale: t
      });
    });
    ue(this, "dispatchError", (t) => {
      this.dispatchEvent("error", {
        error: t
      });
    });
    ue(this, "dispatchTimeUpdate", (t) => {
      this.dispatchEvent("timeupdate", t);
    });
    ue(this, "dispatchFrameUpdate", (t) => {
      this.dispatchEvent("frameupdate", t);
    });
    ue(this, "dispatchFullscreenChange", (t) => {
      this.dispatchEvent("fullscreenchange", t);
    });
    ue(this, "dispatchMuteChange", (t) => {
      this.dispatchEvent("mutechange", t);
    });
    ue(this, "dispatchWaiting", (t) => {
      this.dispatchEvent("waiting", t);
    });
    ue(this, "dispatchResume", (t) => {
      this.dispatchEvent("resume", t);
    });
  }
  addEventListener(t, n) {
    this.listeners[t].push(n);
  }
  removeEventListener(t, n) {
    this.listeners[t] = this.listeners[t].filter((r) => r !== n);
  }
  dispatchEvent(t, n) {
    this.listeners[t].forEach((r) => {
      r({ detail: n });
    });
  }
}
class T3 {
  constructor() {
    ue(this, "listeners", {
      error: [],
      waiting: [],
      resume: []
    });
    ue(this, "dispatchError", (t) => {
      this.dispatchEvent("error", {
        error: t
      });
    });
    ue(this, "dispatchWaiting", (t) => {
      this.dispatchEvent("waiting", t);
    });
    ue(this, "dispatchResume", (t) => {
      this.dispatchEvent("resume", t);
    });
  }
  addEventListener(t, n) {
    this.listeners[t].push(n);
  }
  removeEventListener(t, n) {
    this.listeners[t] = this.listeners[t].filter((r) => r !== n);
  }
  dispatchEvent(t, n) {
    this.listeners[t].forEach((r) => {
      r({ detail: n });
    });
  }
}
var OS = (e) => {
  const { subscribeBuffering: t } = l.useContext(G.SetTimelineContext);
  l.useLayoutEffect(() => t((n) => {
    n.buffering ? e.dispatchWaiting({}) : e.dispatchResume({});
  }), [e, t]);
}, R3 = ({ children: e, currentPlaybackRate: t }) => {
  const [n] = l.useState(() => new I3());
  return l.useEffect(() => {
    t && n.dispatchRateChange(t);
  }, [n, t]), OS(n), /* @__PURE__ */ S.jsx(AS.Provider, {
    value: n,
    children: e
  });
}, F3 = D.createContext(null), Ip = (e, t) => {
  const [n, r] = l.useState(!1);
  return l.useEffect(() => {
    const { current: o } = e;
    if (!o)
      return;
    let i;
    const s = () => {
      t && (clearTimeout(i), i = setTimeout(() => {
        r(!1);
      }, t === !0 ? 3e3 : t));
    }, a = () => {
      r(!0), s();
    }, u = () => {
      r(!1), clearTimeout(i);
    }, c = () => {
      r(!0), s();
    };
    return o.addEventListener("mouseenter", a), o.addEventListener("mouseleave", u), o.addEventListener("mousemove", c), () => {
      o.removeEventListener("mouseenter", a), o.removeEventListener("mouseleave", u), o.removeEventListener("mousemove", c), clearTimeout(i);
    };
  }, [t, e]), n;
}, Ol = () => {
  const e = G.Timeline.useTimelineSeekFrame(), {
    setPlaying: t,
    frameRef: n,
    audioAndVideoTags: r,
    isPlaying: o,
    isBuffering: i
  } = l.useContext(G.SetTimelineContext), s = l.useContext(G.SharedAudioContext), a = l.useContext(G.SharedAudioTagsContext), u = ae(), c = G.useVideo(), d = c?.id ?? null, m = c?.durationInFrames ?? null, f = G.useUnsafeVideoConfig(), v = l.useContext(AS), h = l.useRef(0), w = l.useRef(null), x = l.useRef(!1);
  if (!v)
    throw new TypeError("Expected Player event emitter context");
  const g = l.useCallback(() => {
    if (d === null || m === null)
      return w.current ?? (typeof window > "u" ? 0 : window.remotion_initialFrame ?? 0);
    const L = n.current[d] ?? (u.isPlayer ? 0 : G.Timeline.getFrameForComposition(d));
    return G.Timeline.clampFrameToCompositionRange(L, m);
  }, [u.isPlayer, n, d, m]), p = l.useCallback((L) => {
    const _ = f ? G.TimelinePosition.clampFrameToCompositionRange(L, f.durationInFrames) : Math.max(0, L);
    w.current = _, c?.id && (e((O) => O[c.id] === _ ? O : { ...O, [c.id]: _ }), n.current[c.id] !== _ && (n.current = {
      ...n.current,
      [c.id]: _
    })), v.dispatchSeek(_);
  }, [f, v, n, e, c?.id]), y = l.useCallback((L) => {
    const _ = x.current;
    if (x.current = !1, o())
      return;
    const O = (f?.durationInFrames ?? 1) - 1;
    g() === O && p(0), _ ? s?.resumeAsAutoPlay() : s?.resume(), a && a.numberOfAudioTags > 0 && L && a.playAllAudios(), r.current.forEach((N) => N.play("player play() was called and playing audio from a click")), t(!0), h.current = g(), v.dispatchPlay();
  }, [
    r,
    s,
    a,
    f?.durationInFrames,
    v,
    g,
    o,
    p,
    t
  ]), C = l.useCallback(() => {
    x.current = !0, y();
  }, [y]), b = l.useCallback(() => {
    o() && (t(!1), v.dispatchPause(), s?.suspend());
  }, [s, v, o, t]), E = l.useCallback(() => {
    o() && (t(!1), w.current = h.current, f && (e((L) => ({
      ...L,
      [f.id]: h.current
    })), n.current = {
      ...n.current,
      [f.id]: h.current
    }, v.dispatchPause()));
  }, [f, v, n, o, t, e]), k = (f?.durationInFrames ?? 1) - 1, P = l.useCallback((L) => {
    if (!d)
      return null;
    if (o())
      return;
    const _ = n.current[d] ?? window.remotion_initialFrame ?? 0, O = Math.max(0, _ - L);
    _ !== O && (e((N) => N[d] === O ? N : { ...N, [d]: O }), n.current = {
      ...n.current,
      [d]: O
    });
  }, [n, o, e, d]), F = l.useCallback((L) => {
    if (!d)
      return null;
    if (o())
      return;
    const _ = n.current[d] ?? window.remotion_initialFrame ?? 0, O = Math.min(k, _ + L);
    _ !== O && (e((N) => N[d] === O ? N : { ...N, [d]: O }), n.current = {
      ...n.current,
      [d]: O
    });
  }, [n, k, o, e, d]), I = l.useCallback((L) => {
    o() ? b() : y(L);
  }, [b, y, o]);
  return l.useMemo(() => ({
    frameBack: P,
    frameForward: F,
    emitter: v,
    play: y,
    playAsAutoPlay: C,
    pause: b,
    seek: p,
    getCurrentFrame: g,
    isPlaying: o,
    isBuffering: i,
    pauseAndReturnToPlayStart: E,
    toggle: I
  }), [
    v,
    P,
    F,
    g,
    o,
    b,
    E,
    y,
    C,
    i,
    p,
    I
  ]);
}, M3 = ({
  browserMediaControlsBehavior: e,
  videoConfig: t,
  playbackRate: n
}) => {
  const r = G.usePlaying(), { pause: o, play: i, emitter: s, getCurrentFrame: a, seek: u } = Ol(), c = l.useRef(!1);
  l.useEffect(() => {
    r && (c.current = !0), navigator.mediaSession && e.mode !== "do-nothing" && (r ? navigator.mediaSession.playbackState = "playing" : c.current && (navigator.mediaSession.playbackState = "paused"));
  }, [e.mode, r]), l.useEffect(() => {
    if (!navigator.mediaSession || e.mode === "do-nothing")
      return;
    const d = () => {
      t && navigator.mediaSession && navigator.mediaSession.setPositionState({
        duration: t.durationInFrames / t.fps,
        playbackRate: n,
        position: a() / t.fps
      });
    };
    return s.addEventListener("timeupdate", d), () => {
      s.removeEventListener("timeupdate", d);
    };
  }, [
    e.mode,
    s,
    a,
    n,
    t
  ]), l.useEffect(() => {
    if (navigator.mediaSession && e.mode !== "do-nothing")
      return navigator.mediaSession.setActionHandler("play", () => {
        e.mode === "register-media-session" && i();
      }), navigator.mediaSession.setActionHandler("pause", () => {
        e.mode === "register-media-session" && o();
      }), navigator.mediaSession.setActionHandler("seekto", (d) => {
        e.mode === "register-media-session" && d.seekTime !== void 0 && t && u(Math.round(d.seekTime * t.fps));
      }), navigator.mediaSession.setActionHandler("seekbackward", () => {
        e.mode === "register-media-session" && t && u(Math.max(0, Math.round(a() - 10 * t.fps)));
      }), navigator.mediaSession.setActionHandler("seekforward", () => {
        e.mode === "register-media-session" && t && u(Math.min(t.durationInFrames - 1, Math.round(a() + 10 * t.fps)));
      }), navigator.mediaSession.setActionHandler("previoustrack", () => {
        e.mode === "register-media-session" && u(0);
      }), () => {
        navigator.mediaSession.metadata = null, navigator.mediaSession.setActionHandler("play", null), navigator.mediaSession.setActionHandler("pause", null), navigator.mediaSession.setActionHandler("seekto", null), navigator.mediaSession.setActionHandler("seekbackward", null), navigator.mediaSession.setActionHandler("seekforward", null), navigator.mediaSession.setActionHandler("previoustrack", null);
      };
  }, [
    e.mode,
    a,
    o,
    i,
    u,
    t
  ]);
}, N3 = ({
  time: e,
  currentFrame: t,
  playbackSpeed: n,
  fps: r,
  actualLastFrame: o,
  actualFirstFrame: i,
  framesAdvanced: s,
  shouldLoop: a
}) => {
  const c = (n < 0 ? Math.ceil : Math.floor)(e * n / (1e3 / r)) - s, d = c + t, m = t > o || t < i, f = d > o || d < i, v = !a && f && !m;
  return n > 0 ? f ? {
    nextFrame: i,
    framesToAdvance: c,
    hasEnded: v
  } : { nextFrame: d, framesToAdvance: c, hasEnded: v } : f ? { nextFrame: o, framesToAdvance: c, hasEnded: v } : { nextFrame: d, framesToAdvance: c, hasEnded: v };
}, dg = () => typeof document > "u" ? !1 : document.visibilityState === "hidden", $3 = () => {
  const e = l.useRef(dg());
  return l.useEffect(() => {
    const t = () => {
      e.current = dg();
    };
    return document.addEventListener("visibilitychange", t), () => {
      document.removeEventListener("visibilitychange", t);
    };
  }, []), e;
}, Oc = ({
  audioContext: e,
  audioSyncAnchor: t,
  absoluteTimeInSeconds: n,
  globalPlaybackRate: r,
  logLevel: o,
  force: i
}) => {
  const s = e.currentTime - n / r, a = s - t.value, u = G.getAudioSyncAnchorTolerance(e);
  return Math.abs(a) < u && !i || Math.abs(a) < Number.EPSILON ? !1 : (G.Log.verbose({ logLevel: o, tag: "audio-scheduling" }, "Anchor " + (i ? "forcibly " : "") + "changed from %s to %s with shift %s", t.value, s, a), t.value = s, !0);
}, _3 = (e) => {
  if (e === "suspended" || e === "running-to-suspended")
    return !0;
  if (e === "closed" || e === "interrupted" || e === "running" || e === "suspended-to-running")
    return !1;
  throw new Error(`Unexpected audio context state: ${e}`);
}, A3 = ({
  loop: e,
  playbackRate: t,
  moveToBeginningWhenEnded: n,
  inFrame: r,
  outFrame: o,
  browserMediaControlsBehavior: i,
  getCurrentFrame: s,
  muted: a
}) => {
  const u = G.useUnsafeVideoConfig(), c = u?.fps ?? null, d = u?.durationInFrames ?? null, m = u?.id ?? null, f = G.Timeline.useTimelinePosition(), v = G.usePlaying(), { pause: h, emitter: w, isPlaying: x } = Ol(), g = G.Timeline.useTimelineSetFrameWithoutSeek(), p = l.useContext(G.SharedAudioContext), { setPlayerMuted: y } = l.useContext(G.SetMediaVolumeContext), { isBuffering: C, subscribeBuffering: b, seek: E } = l.useContext(G.SetTimelineContext), k = G.useLogLevel(), P = $3(), F = l.useRef(0), I = l.useRef(null), L = l.useRef(a), _ = l.useRef(null);
  M3({
    browserMediaControlsBehavior: i,
    playbackRate: t,
    videoConfig: u
  }), l.useLayoutEffect(() => {
    if (!p || !p.audioContext || c === null || a)
      return;
    Oc({
      audioContext: p.audioContext,
      audioSyncAnchor: p.audioSyncAnchor,
      absoluteTimeInSeconds: f / c,
      globalPlaybackRate: t,
      logLevel: k,
      force: !1
    }) && p.audioSyncAnchorEmitter.dispatch("changed");
  }, [c, f, k, t, p, a]), l.useLayoutEffect(() => {
    const O = p?.audioContext;
    if (!O || c === null || a)
      return;
    const N = () => {
      const j = p?.getAudioContextState();
      j && _3(j) && Oc({
        audioContext: O,
        audioSyncAnchor: p.audioSyncAnchor,
        absoluteTimeInSeconds: s() / c,
        globalPlaybackRate: t,
        logLevel: k,
        force: !0
      }) && p.audioSyncAnchorEmitter.dispatch("changed");
    };
    return O?.addEventListener("statechange", N), () => {
      O?.removeEventListener("statechange", N);
    };
  }, [c, s, k, a, t, p]), l.useEffect(() => {
    const O = L.current;
    if (L.current = a, c === null || d === null || m === null) {
      I.current = null;
      return;
    }
    if (!v) {
      I.current = null, p?.suspend?.();
      return;
    }
    const N = I.current, j = N === null || N.compositionId !== m || N.fps !== c || N.playbackRate !== t, V = j ? {
      compositionId: m,
      startedTime: performance.now(),
      framesAdvanced: 0,
      fps: c,
      playbackRate: t
    } : N;
    if (I.current = V, p?._experimentalKeepAudioContextAlive && p.audioContext && !a) {
      const K = O && !a, Q = _.current !== p.audioContext, X = j || K || Q, J = Oc({
        audioContext: p.audioContext,
        audioSyncAnchor: p.audioSyncAnchor,
        absoluteTimeInSeconds: s() / c,
        globalPlaybackRate: t,
        logLevel: k,
        force: X
      });
      _.current = p.audioContext, (J || X) && p.audioSyncAnchorEmitter.dispatch("changed");
    }
    let B = !1, A = !1, T = null, M = s(), R = E?.revision.current ?? null;
    const $ = () => {
      T !== null && (T.type === "raf" ? cancelAnimationFrame(T.id) : clearTimeout(T.id));
    }, z = () => {
      B = !0, $();
    }, q = () => {
      if (B)
        return;
      if (!x()) {
        p?.suspend?.();
        return;
      }
      !a && !A && !C() && p?.resume?.();
      const K = performance.now() - V.startedTime, Q = o ?? d - 1, X = r ?? 0, J = E?.revision.current ?? null;
      J !== R && (M = s(), R = J);
      const oe = M, { nextFrame: Z, framesToAdvance: le, hasEnded: de } = N3({
        time: K,
        currentFrame: oe,
        playbackSpeed: t,
        fps: c,
        actualFirstFrame: X,
        actualLastFrame: Q,
        framesAdvanced: V.framesAdvanced,
        shouldLoop: e
      });
      V.framesAdvanced += le;
      const pt = de && !n ? t > 0 ? Q : X : Z;
      if (pt !== oe && !C() && (M = pt, g((we) => ({ ...we, [m]: pt }))), de) {
        z(), h(), w.dispatchEnded();
        return;
      }
      H();
    }, H = () => {
      if (B)
        return;
      const K = A ? null : p?.getIsResumingAudioContext?.() ?? null;
      if (K !== null && !a) {
        K.then((Q) => {
          B || (Q === "failed" && (A = !0, p?.suspend(), y(!0)), V.startedTime = performance.now(), V.framesAdvanced = 0, H());
        });
        return;
      }
      if (C()) {
        !a && !A && p?.suspend?.();
        const Q = b((X) => {
          X.buffering || (Q(), !a && !A && p?._experimentalKeepAudioContextAlive && p.resume(), V.startedTime = performance.now(), V.framesAdvanced = 0, H());
        });
        return;
      }
      if (P.current) {
        T = {
          type: "timeout",
          id: setTimeout(q, 1e3 / c)
        };
        return;
      }
      T = { type: "raf", id: requestAnimationFrame(q) };
    };
    H();
    const U = () => {
      document.visibilityState !== "visible" && ($(), q());
    };
    return window.addEventListener("visibilitychange", U), () => {
      window.removeEventListener("visibilitychange", U), z();
    };
  }, [
    m,
    d,
    c,
    e,
    h,
    v,
    g,
    w,
    t,
    r,
    o,
    n,
    P,
    s,
    C,
    x,
    p,
    y,
    b,
    E,
    k,
    a
  ]), l.useEffect(() => {
    const O = performance.now(), N = O - F.current;
    if (N >= 250) {
      w.dispatchTimeUpdate({ frame: f }), F.current = O;
      return;
    }
    const j = setTimeout(() => {
      w.dispatchTimeUpdate({ frame: f }), F.current = performance.now();
    }, 250 - N);
    return () => clearTimeout(j);
  }, [w, f]), l.useEffect(() => {
    w.dispatchFrameUpdate({ frame: f });
  }, [w, f]);
}, jc = [], Dc = (e) => e ? "current" in e ? e.current : e : null, Tp = (e, t) => {
  const [n, r] = l.useState(() => {
    const s = Dc(e);
    if (!s)
      return null;
    const a = s.getClientRects();
    return a[0] ? {
      width: a[0].width,
      height: a[0].height,
      left: a[0].x,
      top: a[0].y,
      windowSize: {
        height: window.innerHeight,
        width: window.innerWidth
      }
    } : null;
  }), o = l.useMemo(() => typeof ResizeObserver > "u" ? null : new ResizeObserver((s) => {
    const { contentRect: a, target: u } = s[0], c = u.getClientRects();
    if (!c?.[0]) {
      r(null);
      return;
    }
    const d = a.width === 0 ? 1 : c[0].width / a.width, m = a.height === 0 ? 1 : c[0].height / a.height, f = t.shouldApplyCssTransforms || d === 0 ? c[0].width : c[0].width * (1 / d), v = t.shouldApplyCssTransforms || m === 0 ? c[0].height : c[0].height * (1 / m);
    r((h) => h && h.width === f && h.height === v && h.left === c[0].x && h.top === c[0].y && h.windowSize.height === window.innerHeight && h.windowSize.width === window.innerWidth ? h : {
      width: f,
      height: v,
      left: c[0].x,
      top: c[0].y,
      windowSize: {
        height: window.innerHeight,
        width: window.innerWidth
      }
    });
  }), [t.shouldApplyCssTransforms]), i = l.useCallback(() => {
    const s = Dc(e);
    if (!s)
      return;
    const a = s.getClientRects();
    if (!a[0]) {
      r(null);
      return;
    }
    r((u) => u && u.width === a[0].width && u.height === a[0].height && u.left === a[0].x && u.top === a[0].y && u.windowSize.height === window.innerHeight && u.windowSize.width === window.innerWidth ? u : {
      width: a[0].width,
      height: a[0].height,
      left: a[0].x,
      top: a[0].y,
      windowSize: {
        height: window.innerHeight,
        width: window.innerWidth
      }
    });
  }, [e]);
  return l.useEffect(() => {
    i();
  }, [i]), l.useEffect(() => {
    if (!o)
      return;
    const s = Dc(e);
    return s && o.observe(s), () => {
      s && o.unobserve(s);
    };
  }, [o, e]), l.useEffect(() => {
    if (t.triggerOnWindowResize)
      return window.addEventListener("resize", i), () => {
        window.removeEventListener("resize", i);
      };
  }, [t.triggerOnWindowResize, i]), l.useEffect(() => (jc.push(i), () => {
    jc = jc.filter((s) => s !== i);
  }), [i]), l.useMemo(() => n ? { ...n, refresh: i } : null, [n, i]);
}, Rp = (e) => e ?? "__remotion-player", L3 = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  flex: 1,
  height: "100%",
  width: "100%"
};
class jS extends D.Component {
  constructor() {
    super(...arguments);
    ue(this, "state", { hasError: null });
  }
  static getDerivedStateFromError(n) {
    return { hasError: n };
  }
  componentDidCatch(n) {
    this.props.onError(n);
  }
  render() {
    return this.state.hasError ? /* @__PURE__ */ S.jsx("div", {
      style: L3,
      children: this.props.errorFallback({
        error: this.state.hasError
      })
    }) : this.props.children;
  }
}
var O3 = async () => {
  if (typeof window > "u" || typeof window.crypto > "u" || typeof window.crypto.subtle > "u")
    return null;
  try {
    const e = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(window.location.hostname));
    return Array.from(new Uint8Array(e)).map((t) => t.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}, Vc = {
  backgroundColor: "red",
  position: "absolute",
  padding: 12,
  fontFamily: "Arial"
}, j3 = [
  "28d262b44cc61fa750f1686b16ad0604dabfe193fbc263eec05c89b7ad4c2cd6",
  "4db1b0a94be33165dfefcb3ba03d04c7a2666dd27c496d3dc9fa41858e94925e",
  "fbc48530bbf245da790f63675e84e06bab38c3b114fab07eb350025119922bdc",
  "7baf10a8932757b1b3a22b3fce10a048747ac2f8eaf638603487e3705b07eb83",
  "8a6c21a598d8c667272b5207c051b85997bf5b45d5fb712378be3f27cd72c6a6",
  "a2f7aaac9c50a9255e7fc376110c4e0bfe153722dc66ed3c5d3bf2a135f65518"
], fg = !1, D3 = () => {
  const [e, t] = D.useState(!1);
  return l.useEffect(() => {
    fg || (fg = !0, O3().then((n) => {
      n && j3.includes(n) && t(!0);
    }).catch(() => {
    }));
  }, []), l.useEffect(() => {
    if (!e)
      return;
    const n = () => {
      if (!document.querySelector(".warning-banner")) {
        const i = document.createElement("div");
        i.className = "warning-banner", Object.assign(i.style, Vc, {
          zIndex: "9999",
          cssText: `${Vc.cssText} !important;`
        }), i.innerHTML = `
	        <a href="https://github.com/remotion-dev/remotion/pull/4589" style="color: white;">
	          Remotion Unlicensed – Contact hi@remotion.dev
	        </a>
	      `, document.body.appendChild(i);
      }
    }, r = new MutationObserver(() => n());
    return r.observe(document.body, { childList: !0, subtree: !0 }), () => {
      r.disconnect();
    };
  }, [e]), e ? /* @__PURE__ */ S.jsx("div", {
    style: Vc,
    className: "warning-banner",
    children: /* @__PURE__ */ S.jsx("a", {
      style: { color: "white" },
      href: "https://github.com/remotion-dev/remotion/pull/4589",
      children: "Remotion Unlicensed – Contact hi@remotion.dev"
    })
  }) : null;
}, mg = ({ playing: e, buffering: t }) => e && t ? /* @__PURE__ */ S.jsx(E3, {
  type: "player"
}) : e ? /* @__PURE__ */ S.jsx(y3, {}) : /* @__PURE__ */ S.jsx(g3, {}), fo = 12, pg = 5, V3 = ({
  volume: e,
  isVertical: t,
  onBlur: n,
  inputRef: r,
  setVolume: o
}) => {
  const i = l.useMemo(() => {
    const f = {
      paddingLeft: 5,
      height: ze,
      width: kr,
      display: "inline-flex",
      alignItems: "center"
    };
    return t ? {
      ...f,
      position: "absolute",
      transform: `rotate(-90deg) translateX(${kr / 2 + ze / 2}px)`
    } : {
      ...f
    };
  }, [t]), s = typeof D.useId > "u" ? "volume-slider" : D.useId(), [a] = l.useState(() => `__remotion-volume-slider-${js(s)}`.replace(".", "")), u = l.useCallback((m) => {
    o(parseFloat(m.target.value));
  }, [o]), c = l.useMemo(() => {
    const m = {
      WebkitAppearance: "none",
      backgroundColor: "rgba(255, 255, 255, 0.5)",
      borderRadius: pg / 2,
      cursor: "pointer",
      height: pg,
      width: kr,
      backgroundImage: `linear-gradient(
				to right,
				white ${e * 100}%, rgba(255, 255, 255, 0) ${e * 100}%
			)`
    };
    return t ? {
      ...m,
      bottom: ze + kr / 2
    } : m;
  }, [t, e]), d = `
	.${a}::-webkit-slider-thumb {
		-webkit-appearance: none;
		background-color: white;
		border-radius: ${fo / 2}px;
		box-shadow: 0 0 2px black;
		height: ${fo}px;
		width: ${fo}px;
	}

	.${a}::-moz-range-thumb {
		-webkit-appearance: none;
		background-color: white;
		border-radius: ${fo / 2}px;
		box-shadow: 0 0 2px black;
		height: ${fo}px;
		width: ${fo}px;
	}
`;
  return /* @__PURE__ */ S.jsxs("div", {
    style: i,
    children: [
      /* @__PURE__ */ S.jsx("style", {
        dangerouslySetInnerHTML: {
          __html: d
        }
      }),
      /* @__PURE__ */ S.jsx("input", {
        ref: r,
        "aria-label": "Change volume",
        className: a,
        max: 1,
        min: 0,
        onBlur: n,
        onChange: u,
        step: 0.01,
        type: "range",
        value: e,
        style: c
      })
    ]
  });
}, z3 = (e) => /* @__PURE__ */ S.jsx(V3, {
  ...e
}), kr = 100, B3 = ({ displayVerticalVolumeSlider: e, renderMuteButton: t, renderVolumeSlider: n }) => {
  const [r, o] = G.usePlayerMutedState(), [i, s] = G.useMediaVolumeState(), [a, u] = l.useState(!1), c = l.useRef(null), d = l.useRef(null), m = Ip(c, !1), f = l.useCallback(() => {
    setTimeout(() => {
      d.current && document.activeElement !== d.current && u(!1);
    }, 10);
  }, []), v = i === 0, h = l.useCallback(() => {
    if (v) {
      s(1), o(!1);
      return;
    }
    o((C) => !C);
  }, [v, o, s]), w = l.useMemo(() => ({
    display: "inline-flex",
    background: "none",
    border: "none",
    justifyContent: "center",
    alignItems: "center",
    touchAction: "none",
    ...e && { position: "relative" }
  }), [e]), x = l.useMemo(() => ({
    display: "inline",
    width: ze,
    height: ze,
    cursor: "pointer",
    appearance: "none",
    background: "none",
    border: "none",
    padding: 0
  }), []), g = l.useCallback(({ muted: C, volume: b }) => {
    const E = C || b === 0;
    return /* @__PURE__ */ S.jsx("button", {
      "aria-label": E ? "Unmute sound" : "Mute sound",
      title: E ? "Unmute sound" : "Mute sound",
      onClick: h,
      onBlur: f,
      onFocus: () => u(!0),
      style: x,
      type: "button",
      children: E ? /* @__PURE__ */ S.jsx(S3, {}) : /* @__PURE__ */ S.jsx(x3, {})
    });
  }, [f, h, x]), p = l.useMemo(() => t ? t({ muted: r, volume: i }) : g({ muted: r, volume: i }), [r, i, g, t]), y = l.useMemo(() => (a || m) && !r && !G.isIosSafari() ? (n ?? z3)({
    isVertical: e,
    volume: i,
    onBlur: () => u(!1),
    inputRef: d,
    setVolume: s
  }) : null, [
    e,
    a,
    m,
    r,
    i,
    n,
    s
  ]);
  return /* @__PURE__ */ S.jsxs("div", {
    ref: c,
    style: w,
    children: [
      p,
      y
    ]
  });
};
function U3(e) {
  const [t, n] = l.useState(e), r = l.useRef(null);
  return l.useEffect(() => {
    const o = (i) => {
      r.current && !r.current.contains(i.target) && n(!1);
    };
    return document.addEventListener("pointerup", o, !0), () => {
      document.removeEventListener("pointerup", o, !0);
    };
  }, []), { ref: r, isComponentVisible: t, setIsComponentVisible: n };
}
var W3 = 35, q3 = 70, H3 = {
  height: 30,
  paddingRight: 15,
  paddingLeft: 12,
  display: "flex",
  flexDirection: "row",
  alignItems: "center"
}, K3 = {
  width: 22,
  display: "flex",
  alignItems: "center"
}, G3 = {
  width: 14,
  height: 14,
  color: "black"
}, Y3 = () => /* @__PURE__ */ S.jsx("svg", {
  viewBox: "0 0 512 512",
  style: G3,
  children: /* @__PURE__ */ S.jsx("path", {
    fill: "currentColor",
    d: "M435.848 83.466L172.804 346.51l-96.652-96.652c-4.686-4.686-12.284-4.686-16.971 0l-28.284 28.284c-4.686 4.686-4.686 12.284 0 16.971l133.421 133.421c4.686 4.686 12.284 4.686 16.971 0l299.813-299.813c4.686-4.686 4.686-12.284 0-16.971l-28.284-28.284c-4.686-4.686-12.284-4.686-16.97 0z"
  })
}), Q3 = (e) => {
  const t = e.toString();
  return t.includes(".") ? t : t + ".0";
}, J3 = ({ rate: e, onSelect: t, selectedRate: n, keyboardSelectedRate: r }) => {
  const o = l.useCallback((m) => {
    m.stopPropagation(), m.preventDefault(), t(e);
  }, [t, e]), [i, s] = l.useState(!1), a = l.useCallback(() => {
    s(!0);
  }, []), u = l.useCallback(() => {
    s(!1);
  }, []), c = r === e, d = l.useMemo(() => ({
    ...H3,
    backgroundColor: i || c ? "#eee" : "transparent"
  }), [i, c]);
  return /* @__PURE__ */ S.jsxs("div", {
    onPointerEnter: a,
    onPointerLeave: u,
    tabIndex: 0,
    style: d,
    onClick: o,
    children: [
      /* @__PURE__ */ S.jsx("div", {
        style: K3,
        children: e === n ? /* @__PURE__ */ S.jsx(Y3, {}) : null
      }),
      Q3(e),
      "x"
    ]
  }, e);
}, Z3 = ({ setIsComponentVisible: e, playbackRates: t, canvasSize: n }) => {
  const { setPlaybackRate: r, playbackRate: o } = G.usePlaybackRate(), [i, s] = l.useState(o);
  l.useEffect(() => {
    const c = (d) => {
      if (!(d.ctrlKey || d.metaKey || d.altKey))
        if (d.key === "ArrowUp") {
          d.preventDefault();
          const m = t.findIndex((f) => f === i);
          if (m === 0)
            return;
          s(m === -1 ? t[0] : t[m - 1]);
        } else if (d.key === "ArrowDown") {
          d.preventDefault();
          const m = t.findIndex((f) => f === i);
          if (m === t.length - 1)
            return;
          s(m === -1 ? t[t.length - 1] : t[m + 1]);
        } else d.key === "Enter" ? (d.preventDefault(), r(i), e(!1)) : d.key === "Escape" ? (d.preventDefault(), e(!1)) : d.key === "Tab" && e(!1);
    };
    return window.addEventListener("keydown", c), () => {
      window.removeEventListener("keydown", c);
    };
  }, [
    t,
    i,
    r,
    e
  ]);
  const a = l.useCallback((c) => {
    r(c), e(!1);
  }, [e, r]), u = l.useMemo(() => ({
    position: "absolute",
    right: 0,
    width: 125,
    maxHeight: n.height - q3 - W3,
    bottom: 35,
    background: "#fff",
    borderRadius: 4,
    overflow: "auto",
    color: "black",
    textAlign: "left"
  }), [n.height]);
  return /* @__PURE__ */ S.jsx("div", {
    style: u,
    children: t.map((c) => /* @__PURE__ */ S.jsx(J3, {
      selectedRate: o,
      onSelect: a,
      rate: c,
      keyboardSelectedRate: i
    }, c))
  });
}, X3 = {
  fontSize: 13,
  fontWeight: "bold",
  color: "white",
  border: "2px solid white",
  borderRadius: 20,
  paddingLeft: 8,
  paddingRight: 8,
  paddingTop: 2,
  paddingBottom: 2
}, pf = {
  appearance: "none",
  backgroundColor: "transparent",
  border: "none",
  cursor: "pointer",
  paddingLeft: 0,
  paddingRight: 0,
  paddingTop: 6,
  paddingBottom: 6,
  height: 37,
  display: "inline-flex",
  marginBottom: 0,
  marginTop: 0,
  alignItems: "center"
}, e5 = {
  ...pf,
  position: "relative"
}, t5 = ({ playbackRates: e, canvasSize: t }) => {
  const { ref: n, isComponentVisible: r, setIsComponentVisible: o } = U3(!1), { playbackRate: i } = G.usePlaybackRate(), s = l.useCallback((a) => {
    a.stopPropagation(), a.preventDefault(), o((u) => !u);
  }, [o]);
  return /* @__PURE__ */ S.jsx("div", {
    ref: n,
    children: /* @__PURE__ */ S.jsxs("button", {
      type: "button",
      "aria-label": "Change playback rate",
      style: e5,
      onClick: s,
      children: [
        /* @__PURE__ */ S.jsxs("div", {
          style: X3,
          children: [
            i,
            "x"
          ]
        }),
        r && /* @__PURE__ */ S.jsx(Z3, {
          canvasSize: t,
          playbackRates: e,
          setIsComponentVisible: o
        })
      ]
    })
  });
}, hg = (e, t, n) => Math.round(Kr(e, [0, n], [0, t - 1], {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp"
})), To = 5, Fi = 12, hf = 4, n5 = {
  userSelect: "none",
  WebkitUserSelect: "none",
  paddingTop: hf,
  paddingBottom: hf,
  boxSizing: "border-box",
  cursor: "pointer",
  position: "relative",
  touchAction: "none"
}, r5 = {
  height: To,
  backgroundColor: "rgba(255, 255, 255, 0.25)",
  width: "100%",
  borderRadius: To / 2
}, o5 = (e) => {
  let t = e;
  for (; t.parentElement; )
    t = t.parentElement;
  return t;
}, i5 = ({ durationInFrames: e, onSeekEnd: t, onSeekStart: n, inFrame: r, outFrame: o }) => {
  const i = l.useRef(null), s = Ip(i, !1), a = Tp(i, {
    triggerOnWindowResize: !0,
    shouldApplyCssTransforms: !0
  }), { seek: u, play: c, pause: d, isPlaying: m } = Ol(), f = G.Timeline.useTimelinePosition(), [v, h] = l.useState({
    dragging: !1
  }), w = a?.width ?? 0, x = l.useCallback((E) => {
    if (E.button !== 0)
      return;
    const k = i.current?.getBoundingClientRect().left, P = hg(E.clientX - k, e, w), F = m();
    d(), u(P), h({
      dragging: !0,
      wasPlaying: F
    }), n();
  }, [e, w, m, d, u, n]), g = l.useCallback((E) => {
    if (!a)
      throw new Error("Player has no size");
    if (!v.dragging)
      return;
    const k = i.current?.getBoundingClientRect().left, P = hg(E.clientX - k, e, a.width);
    u(P);
  }, [v.dragging, e, u, a]), p = l.useCallback(() => {
    h({
      dragging: !1
    }), v.dragging && (v.wasPlaying ? c() : d(), t());
  }, [v, t, d, c]);
  l.useEffect(() => {
    if (!v.dragging)
      return;
    const E = o5(i.current);
    return E.addEventListener("pointermove", g), E.addEventListener("pointerup", p), () => {
      E.removeEventListener("pointermove", g), E.removeEventListener("pointerup", p);
    };
  }, [v.dragging, g, p]);
  const y = l.useMemo(() => ({
    height: Fi,
    width: Fi,
    borderRadius: Fi / 2,
    position: "absolute",
    top: hf - Fi / 2 + 5 / 2,
    backgroundColor: "white",
    left: Math.max(0, f / Math.max(1, e - 1) * w - Fi / 2),
    boxShadow: "0 0 2px black",
    opacity: Number(s || v.dragging)
  }), [s, v.dragging, e, f, w]), C = l.useMemo(() => ({
    height: To,
    backgroundColor: "rgba(255, 255, 255, 1)",
    width: (f - (r ?? 0)) / (e - 1) * w,
    marginLeft: (r ?? 0) / (e - 1) * w,
    borderRadius: To / 2
  }), [e, f, r, w]), b = l.useMemo(() => ({
    height: To,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    width: ((o ?? e - 1) - (r ?? 0)) / (e - 1) * 100 + "%",
    marginLeft: (r ?? 0) / (e - 1) * 100 + "%",
    borderRadius: To / 2,
    position: "absolute"
  }), [e, r, o]);
  return /* @__PURE__ */ S.jsxs("div", {
    ref: i,
    onPointerDown: x,
    style: n5,
    children: [
      /* @__PURE__ */ S.jsxs("div", {
        style: r5,
        children: [
          /* @__PURE__ */ S.jsx("div", {
            style: b
          }),
          /* @__PURE__ */ S.jsx("div", {
            style: C
          })
        ]
      }),
      /* @__PURE__ */ S.jsx("div", {
        style: y
      })
    ]
  });
}, vg = (e) => {
  const t = Math.floor(e / 60), n = Math.floor(e - t * 60);
  return `${String(t)}:${String(n).padStart(2, "0")}`;
}, s5 = ({ durationInFrames: e, maxTimeLabelWidth: t, fps: n }) => {
  const r = G.Timeline.useTimelinePosition(), o = l.useMemo(() => ({
    color: "white",
    fontFamily: "sans-serif",
    fontSize: 14,
    maxWidth: t === null ? void 0 : t,
    overflow: "hidden",
    textOverflow: "ellipsis"
  }), [t]), s = r === e - 1 ? r + 1 : r;
  return /* @__PURE__ */ S.jsxs("div", {
    style: o,
    children: [
      vg(s / n),
      " / ",
      vg(e / n)
    ]
  });
}, a5 = 10, vf = 12, u5 = ({
  allowFullscreen: e,
  playerWidth: t
}) => l.useMemo(() => {
  const r = ze, o = ze, i = e ? mf : 0, s = o + r + i + vf * 2 + a5 * 2, a = t - s, u = Math.max(a, 0), c = u - kr, m = (c < kr ? u : c) + s + kr, f = t < m;
  return {
    maxTimeLabelWidth: u === 0 ? null : u,
    displayVerticalVolumeSlider: f
  };
}, [e, t]), l5 = [
  0,
  0.013,
  0.049,
  0.104,
  0.175,
  0.259,
  0.352,
  0.45,
  0.55,
  0.648,
  0.741,
  0.825,
  0.896,
  0.951,
  0.987
], c5 = [
  0,
  8.1,
  15.5,
  22.5,
  29,
  35.3,
  41.2,
  47.1,
  52.9,
  58.8,
  64.7,
  71,
  77.5,
  84.5,
  91.9
], d5 = 1 / 0.7, f5 = {
  boxSizing: "border-box",
  position: "absolute",
  bottom: 0,
  width: "100%",
  paddingTop: 40,
  paddingBottom: 10,
  backgroundImage: `linear-gradient(to bottom,${l5.map((e, t) => `hsla(0, 0%, 0%, ${e}) ${c5[t] * d5}%`).join(", ")}, hsl(0, 0%, 0%) 100%)`,
  backgroundSize: "auto 145px",
  display: "flex",
  paddingRight: vf,
  paddingLeft: vf,
  flexDirection: "column",
  transition: "opacity 0.3s"
}, m5 = {
  display: "flex",
  flexDirection: "row",
  width: "100%",
  alignItems: "center",
  justifyContent: "center",
  userSelect: "none",
  WebkitUserSelect: "none"
}, p5 = {
  display: "flex",
  flexDirection: "row",
  userSelect: "none",
  WebkitUserSelect: "none",
  alignItems: "center"
}, Mi = {
  width: 12
}, h5 = {
  height: 8
}, v5 = {
  flex: 1
}, g5 = {}, y5 = ({
  durationInFrames: e,
  isFullscreen: t,
  fps: n,
  showVolumeControls: r,
  onFullscreenButtonClick: o,
  allowFullscreen: i,
  onExitFullscreenButtonClick: s,
  spaceKeyToPlayOrPause: a,
  onSeekEnd: u,
  onSeekStart: c,
  inFrame: d,
  outFrame: m,
  initiallyShowControls: f,
  canvasSize: v,
  renderPlayPauseButton: h,
  renderFullscreenButton: w,
  alwaysShowControls: x,
  showPlaybackRateControl: g,
  containerRef: p,
  buffering: y,
  hideControlsWhenPointerDoesntMove: C,
  onPointerDown: b,
  onDoubleClick: E,
  renderMuteButton: k,
  renderVolumeSlider: P,
  playing: F,
  toggle: I,
  renderCustomControls: L
}) => {
  const _ = l.useRef(null), [O, N] = l.useState(!1), j = Ip(p, C), { maxTimeLabelWidth: V, displayVerticalVolumeSlider: B } = u5({
    allowFullscreen: i,
    playerWidth: v?.width ?? 0
  }), [A, T] = l.useState(() => {
    if (typeof f == "boolean")
      return f;
    if (typeof f == "number") {
      if (f % 1 !== 0)
        throw new Error("initiallyShowControls must be an integer or a boolean");
      if (Number.isNaN(f))
        throw new Error("initiallyShowControls must not be NaN");
      if (!Number.isFinite(f))
        throw new Error("initiallyShowControls must be finite");
      if (f <= 0)
        throw new Error("initiallyShowControls must be a positive integer");
      return f;
    }
    throw new TypeError("initiallyShowControls must be a number or a boolean");
  }), M = l.useMemo(() => ({
    ...f5,
    opacity: Number(j || !F || A || x)
  }), [j, A, F, x]);
  l.useEffect(() => {
    _.current && a && _.current.focus({
      preventScroll: !0
    });
  }, [F, a]), l.useEffect(() => {
    N((typeof document < "u" && (document.fullscreenEnabled || document.webkitFullscreenEnabled)) ?? !1);
  }, []), l.useEffect(() => {
    if (A === !1)
      return;
    const Q = setTimeout(() => {
      T(!1);
    }, A === !0 ? 2e3 : A);
    return () => {
      clearInterval(Q);
    };
  }, [A]);
  const R = l.useMemo(() => {
    if (g === !0)
      return [0.5, 0.8, 1, 1.2, 1.5, 1.8, 2, 2.5, 3];
    if (Array.isArray(g)) {
      for (const K of g) {
        if (typeof K != "number")
          throw new Error("Every item in showPlaybackRateControl must be a number");
        if (K <= 0)
          throw new Error("Every item in showPlaybackRateControl must be positive");
      }
      return g;
    }
    return null;
  }, [g]), $ = L ? L() : null, z = l.useRef(null), q = l.useRef(null), H = l.useCallback((K) => {
    (K.target === z.current || K.target === q.current) && b?.(K);
  }, [b]), U = l.useCallback((K) => {
    (K.target === z.current || K.target === q.current) && E?.(K);
  }, [E]);
  return /* @__PURE__ */ S.jsxs("div", {
    ref: z,
    style: M,
    onPointerDown: H,
    onDoubleClick: U,
    children: [
      /* @__PURE__ */ S.jsxs("div", {
        ref: q,
        style: m5,
        children: [
          /* @__PURE__ */ S.jsxs("div", {
            style: p5,
            children: [
              /* @__PURE__ */ S.jsx("button", {
                ref: _,
                type: "button",
                style: pf,
                onClick: I,
                "aria-label": F ? "Pause video" : "Play video",
                title: F ? "Pause video" : "Play video",
                children: h === null ? /* @__PURE__ */ S.jsx(mg, {
                  buffering: y,
                  playing: F
                }) : h({
                  playing: F,
                  isBuffering: y
                }) ?? /* @__PURE__ */ S.jsx(mg, {
                  buffering: y,
                  playing: F
                })
              }),
              r ? /* @__PURE__ */ S.jsxs(S.Fragment, {
                children: [
                  /* @__PURE__ */ S.jsx("div", {
                    style: Mi
                  }),
                  /* @__PURE__ */ S.jsx(B3, {
                    renderMuteButton: k,
                    renderVolumeSlider: P,
                    displayVerticalVolumeSlider: B
                  })
                ]
              }) : null,
              /* @__PURE__ */ S.jsx("div", {
                style: Mi
              }),
              /* @__PURE__ */ S.jsx(s5, {
                durationInFrames: e,
                fps: n,
                maxTimeLabelWidth: V
              }),
              /* @__PURE__ */ S.jsx("div", {
                style: Mi
              })
            ]
          }),
          /* @__PURE__ */ S.jsx("div", {
            style: v5
          }),
          $,
          $ && R && v ? /* @__PURE__ */ S.jsx("div", {
            style: Mi
          }) : null,
          R && v && /* @__PURE__ */ S.jsx(t5, {
            canvasSize: v,
            playbackRates: R
          }),
          R && O && i ? /* @__PURE__ */ S.jsx("div", {
            style: Mi
          }) : null,
          /* @__PURE__ */ S.jsx("div", {
            style: g5,
            children: O && i ? /* @__PURE__ */ S.jsx("button", {
              type: "button",
              "aria-label": t ? "Exit fullscreen" : "Enter Fullscreen",
              title: t ? "Exit fullscreen" : "Enter Fullscreen",
              style: pf,
              onClick: t ? s : o,
              children: w === null ? /* @__PURE__ */ S.jsx(w3, {
                isFullscreen: t
              }) : w({ isFullscreen: t })
            }) : null
          })
        ]
      }),
      /* @__PURE__ */ S.jsx("div", {
        style: h5
      }),
      /* @__PURE__ */ S.jsx(i5, {
        onSeekEnd: u,
        onSeekStart: c,
        durationInFrames: e,
        inFrame: d,
        outFrame: m
      })
    ]
  });
}, DS = typeof document > "u", w5 = (e) => {
  let t = !1;
  return {
    promise: new Promise((r, o) => {
      e.then((i) => {
        if (t) {
          o({ isCanceled: t, value: i });
          return;
        }
        r(i);
      }).catch((i) => {
        o({ isCanceled: t, error: i });
      });
    }),
    cancel: () => {
      t = !0;
    }
  };
}, S5 = (e) => new Promise((t) => setTimeout(t, e)), x5 = () => {
  const e = l.useRef([]), t = l.useCallback((i) => {
    e.current = [...e.current, i];
  }, []), n = l.useCallback((i) => {
    e.current = e.current.filter((s) => s !== i);
  }, []), r = l.useCallback(() => e.current.map((i) => i.cancel()), []);
  return l.useMemo(() => ({
    appendPendingPromise: t,
    removePendingPromise: n,
    clearPendingPromises: r
  }), [t, r, n]);
}, C5 = (e, t, n) => {
  const r = x5(), o = l.useCallback(async (u) => {
    if (u instanceof PointerEvent ? u.pointerType === "touch" : u.nativeEvent.pointerType === "touch") {
      e(u);
      return;
    }
    r.clearPendingPromises();
    const c = w5(S5(200));
    r.appendPendingPromise(c);
    try {
      await c.promise, r.removePendingPromise(c), e(u);
    } catch (d) {
      const m = d;
      if (r.removePendingPromise(c), !m.isCanceled)
        throw m.error;
    }
  }, [r, e]), i = l.useCallback(() => {
    document.addEventListener("pointerup", (u) => {
      o(u);
    }, {
      once: !0
    });
  }, [o]), s = l.useCallback(() => {
    r.clearPendingPromises(), t();
  }, [r, t]);
  return l.useMemo(() => n ? { handlePointerDown: i, handleDoubleClick: s } : { handlePointerDown: e, handleDoubleClick: () => {
  } }, [n, s, i, e]);
}, gf = D.version.split(".")[0];
if (gf === "0")
  throw new Error(`Version ${gf} of "react" is not supported by Remotion`);
var b5 = parseInt(gf, 10) >= 18, E5 = ({
  controls: e,
  style: t,
  loop: n,
  autoPlay: r,
  allowFullscreen: o,
  inputProps: i,
  clickToPlay: s,
  showVolumeControls: a,
  doubleClickToFullscreen: u,
  spaceKeyToPlayOrPause: c,
  errorFallback: d,
  playbackRate: m,
  renderLoading: f,
  renderPoster: v,
  className: h,
  moveToBeginningWhenEnded: w,
  showPosterWhenUnplayed: x,
  showPosterWhenEnded: g,
  showPosterWhenPaused: p,
  showPosterWhenBuffering: y,
  showPosterWhenBufferingAndPaused: C,
  inFrame: b,
  outFrame: E,
  initiallyShowControls: k,
  renderFullscreen: P,
  renderPlayPauseButton: F,
  renderMuteButton: I,
  renderVolumeSlider: L,
  renderCustomControls: _,
  alwaysShowControls: O,
  showPlaybackRateControl: N,
  posterFillMode: j,
  bufferStateDelayInMilliseconds: V,
  hideControlsWhenPointerDoesntMove: B,
  overflowVisible: A,
  browserMediaControlsBehavior: T,
  overrideInternalClassName: M,
  noSuspense: R
}, $) => {
  const z = G.useUnsafeVideoConfig(), q = G.useVideo(), H = l.useRef(null), U = Tp(H, {
    triggerOnWindowResize: !1,
    shouldApplyCssTransforms: !1
  }), [K, Q] = l.useState(!1), [X, J] = l.useState(r), [oe, Z] = l.useState(() => !1), [le, de] = l.useState(!1), [pt, we] = l.useState(!1), Re = l.useMemo(() => typeof document > "u" ? !1 : !!(document.fullscreenEnabled || document.webkitFullscreenEnabled), []), ee = Ol(), Oe = G.usePlaying(), be = G.Timeline.useTimelinePosition(), $e = l.useCallback((re) => {
    ee.isPlaying() || (we(!0), ee.play(re));
  }, [ee]), { playerMuted: ie, mediaVolume: Ee } = l.useContext(G.MediaVolumeContext), pe = l.useContext(cg), Et = l.useRef(null);
  l.useEffect(() => {
    ee.emitter.dispatchVolumeChange(Ee);
  }, [ee.emitter, Ee]);
  const rt = ie || Ee === 0;
  l.useEffect(() => {
    ee.emitter.dispatchMuteChange({
      isMuted: rt
    });
  }, [ee.emitter, rt]), A3({
    loop: n,
    playbackRate: m,
    moveToBeginningWhenEnded: w,
    inFrame: b,
    outFrame: E,
    getCurrentFrame: ee.getCurrentFrame,
    browserMediaControlsBehavior: T,
    muted: rt
  }), l.useEffect(() => {
    K && !Oe && (Q(!1), $e());
  }, [K, $e, Oe]), l.useEffect(() => {
    const { current: re } = H;
    if (!re)
      return;
    const te = () => {
      const Qe = document.fullscreenElement === re || document.webkitFullscreenElement === re;
      Z(Qe);
    };
    return document.addEventListener("fullscreenchange", te), document.addEventListener("webkitfullscreenchange", te), () => {
      document.removeEventListener("fullscreenchange", te), document.removeEventListener("webkitfullscreenchange", te);
    };
  }, []);
  const je = l.useCallback((re) => {
    ee.isPlaying() ? ee.pause() : $e(re);
  }, [$e, ee]), Ue = l.useCallback(() => {
    if (!o)
      throw new Error("allowFullscreen is false");
    if (!Re)
      throw new Error("Browser doesnt support fullscreen");
    if (!H.current)
      throw new Error("No player ref found");
    H.current.webkitRequestFullScreen ? H.current.webkitRequestFullScreen() : H.current.requestFullscreen();
  }, [o, Re]), We = l.useCallback(() => {
    document.webkitExitFullscreen ? document.webkitExitFullscreen() : document.exitFullscreen();
  }, []);
  l.useEffect(() => {
    const { current: re } = H;
    if (!re)
      return;
    const te = () => {
      const Qe = document.webkitFullscreenElement ?? document.fullscreenElement;
      Qe && Qe === H.current ? ee.emitter.dispatchFullscreenChange({
        isFullscreen: !0
      }) : ee.emitter.dispatchFullscreenChange({
        isFullscreen: !1
      });
    };
    return re.addEventListener("webkitfullscreenchange", te), re.addEventListener("fullscreenchange", te), () => {
      re.removeEventListener("webkitfullscreenchange", te), re.removeEventListener("fullscreenchange", te);
    };
  }, [ee.emitter]);
  const Lt = z?.durationInFrames ?? 1, ot = l.useMemo(() => !z || !U ? null : MS({
    canvasSize: U,
    compositionHeight: z.height,
    compositionWidth: z.width,
    previewSize: "auto"
  }), [U, z]), ke = ot?.scale ?? 1, Ot = l.useMemo(() => ({ rootRef: Et, scale: ke }), [ke]), yn = l.useRef(!1);
  l.useEffect(() => {
    if (!yn.current) {
      yn.current = !0;
      return;
    }
    ee.emitter.dispatchScaleChange(ke);
  }, [ee.emitter, ke]);
  const { setMediaVolume: wn, setPlayerMuted: Dn } = l.useContext(G.SetMediaVolumeContext), [jt, Xt] = l.useState(!1);
  l.useEffect(() => {
    let re = null, te = !1;
    const Qe = () => {
      te = !1, requestAnimationFrame(() => {
        V === 0 ? Xt(!0) : re = setTimeout(() => {
          te || Xt(!0);
        }, V);
      });
    }, en = () => {
      requestAnimationFrame(() => {
        te = !0, Xt(!1), re && clearTimeout(re);
      });
    };
    return ee.emitter.addEventListener("waiting", Qe), ee.emitter.addEventListener("resume", en), () => {
      ee.emitter.removeEventListener("waiting", Qe), ee.emitter.removeEventListener("resume", en), Xt(!1), re && clearTimeout(re), te = !0;
    };
  }, [V, ee.emitter]), l.useImperativeHandle($, () => {
    const re = {
      play: $e,
      pause: () => {
        Q(!1), ee.pause();
      },
      toggle: je,
      getContainerNode: () => H.current,
      getCurrentFrame: ee.getCurrentFrame,
      isPlaying: ee.isPlaying,
      seekTo: (te) => {
        const Qe = Lt - 1, en = Math.max(0, Math.min(Qe, te));
        ee.isPlaying() && (Q(en !== Qe || n), ee.pause()), en === Qe && !n && ee.emitter.dispatchEnded(), ee.seek(en);
      },
      isFullscreen: () => {
        const { current: te } = H;
        return te ? document.fullscreenElement === te || document.webkitFullscreenElement === te : !1;
      },
      requestFullscreen: Ue,
      exitFullscreen: We,
      getVolume: () => ie ? 0 : Ee,
      setVolume: (te) => {
        if (typeof te != "number")
          throw new TypeError(`setVolume() takes a number, got value of type ${typeof te}`);
        if (isNaN(te))
          throw new TypeError("setVolume() got a number that is NaN. Volume must be between 0 and 1.");
        if (te < 0 || te > 1)
          throw new TypeError(`setVolume() got a number that is out of range. Must be between 0 and 1, got ${te}`);
        wn(te);
      },
      isMuted: () => rt,
      mute: () => {
        Dn(!0);
      },
      unmute: () => {
        Dn(!1);
      },
      getScale: () => ke,
      pauseAndReturnToPlayStart: () => {
        ee.pauseAndReturnToPlayStart();
      }
    };
    return Object.assign(ee.emitter, re);
  }, [
    Lt,
    We,
    n,
    ie,
    rt,
    Ee,
    ee,
    $e,
    Ue,
    Dn,
    wn,
    je,
    ke
  ]);
  const Qr = q ? q.component : null, ht = l.useMemo(() => NS({
    canvasSize: U,
    config: z,
    style: t,
    overflowVisible: A,
    layout: ot
  }), [U, z, ot, A, t]), it = l.useMemo(() => _S({ config: z, layout: ot, scale: ke, overflowVisible: A }), [z, ot, A, ke]), Vn = l.useMemo(() => $S({
    config: z,
    layout: ot,
    scale: ke,
    overflowVisible: A
  }), [z, ot, A, ke]), zn = ee.pause, si = ee.emitter.dispatchError, Bn = l.useCallback((re) => {
    zn(), si(re);
  }, [si, zn]), Jr = l.useCallback((re) => {
    re.stopPropagation(), Ue();
  }, [Ue]), Zr = l.useCallback((re) => {
    re.stopPropagation(), We();
  }, [We]), Xr = l.useCallback((re) => {
    (re instanceof MouseEvent ? re.button === 2 : re.nativeEvent.button) || je(re);
  }, [je]), eo = l.useCallback(() => {
    de(!0);
  }, []), Vs = l.useCallback(() => {
    de(!1);
  }, []), to = l.useCallback(() => {
    oe ? We() : Ue();
  }, [We, oe, Ue]), { handlePointerDown: st, handleDoubleClick: Un } = C5(Xr, to, u && o && Re);
  l.useEffect(() => {
    X && (we(!0), ee.playAsAutoPlay(), J(!1));
  }, [ee, X]);
  const ai = l.useMemo(() => f ? f({
    height: ht.height,
    width: ht.width,
    isBuffering: jt
  }) : null, [ht.height, ht.width, f, jt]), no = l.useMemo(() => ({
    type: "scale",
    scale: ke
  }), [ke]);
  if (!z)
    return null;
  const Sn = v ? v({
    height: j === "player-size" ? ht.height : z.height,
    width: j === "player-size" ? ht.width : z.width,
    isBuffering: jt
  }) : null;
  if (Sn === void 0)
    throw new TypeError("renderPoster() must return a React element, but undefined was returned");
  const ui = Sn && [
    p && !Oe && !le,
    g && be === Lt - 1 && !Oe,
    x && !pt && !Oe,
    y && jt && Oe,
    C && jt && !Oe
  ].some(Boolean), { left: jl, top: li, width: Dl, height: zs, ...ci } = it, ro = /* @__PURE__ */ S.jsxs(S.Fragment, {
    children: [
      /* @__PURE__ */ S.jsxs("div", {
        style: it,
        onPointerDown: s ? st : void 0,
        onDoubleClick: u ? Un : void 0,
        children: [
          /* @__PURE__ */ S.jsxs("div", {
            ref: Et,
            style: Vn,
            className: Rp(M),
            children: [
              Qr ? /* @__PURE__ */ S.jsx(jS, {
                onError: Bn,
                errorFallback: d,
                children: /* @__PURE__ */ S.jsx(G.CurrentScaleContext.Provider, {
                  value: no,
                  children: /* @__PURE__ */ S.jsx(cg.Provider, {
                    value: null,
                    children: /* @__PURE__ */ S.jsx(Qr, {
                      ...q?.props ?? {},
                      ...i ?? {}
                    })
                  })
                })
              }) : null,
              ui && j === "composition-size" ? /* @__PURE__ */ S.jsx("div", {
                style: {
                  ...ci,
                  width: z.width,
                  height: z.height
                },
                onPointerDown: s ? st : void 0,
                onDoubleClick: u ? Un : void 0,
                children: Sn
              }) : null
            ]
          }),
          /* @__PURE__ */ S.jsx(D3, {}),
          /* @__PURE__ */ S.jsx(P3.Provider, {
            value: Ot,
            children: pe
          })
        ]
      }),
      ui && j === "player-size" ? /* @__PURE__ */ S.jsx("div", {
        style: it,
        onPointerDown: s ? st : void 0,
        onDoubleClick: u ? Un : void 0,
        children: Sn
      }) : null,
      e ? /* @__PURE__ */ S.jsx(y5, {
        fps: z.fps,
        playing: Oe,
        toggle: je,
        durationInFrames: z.durationInFrames,
        containerRef: H,
        onFullscreenButtonClick: Jr,
        isFullscreen: oe,
        allowFullscreen: o,
        showVolumeControls: a,
        onExitFullscreenButtonClick: Zr,
        spaceKeyToPlayOrPause: c,
        onSeekEnd: Vs,
        onSeekStart: eo,
        inFrame: b,
        outFrame: E,
        initiallyShowControls: k,
        canvasSize: U,
        renderFullscreenButton: P,
        renderPlayPauseButton: F,
        alwaysShowControls: O,
        showPlaybackRateControl: N,
        buffering: jt,
        hideControlsWhenPointerDoesntMove: B,
        onDoubleClick: u ? Un : void 0,
        onPointerDown: s ? st : void 0,
        renderMuteButton: I,
        renderVolumeSlider: L,
        renderCustomControls: _
      }) : null
    ]
  });
  return R || DS && !b5 ? /* @__PURE__ */ S.jsx("div", {
    ref: H,
    style: ht,
    className: h,
    children: ro
  }) : /* @__PURE__ */ S.jsx("div", {
    ref: H,
    style: ht,
    className: h,
    children: /* @__PURE__ */ S.jsx(l.Suspense, {
      fallback: ai,
      children: ro
    })
  });
}, k5 = l.forwardRef(E5), VS = "remotion.volumePreference", P5 = (e, t, n) => {
  if (!(typeof window > "u"))
    try {
      window.localStorage.setItem(n ?? VS, String(e));
    } catch (r) {
      G.Log.error({ logLevel: t, tag: null }, "Could not persist volume", r);
    }
}, I5 = (e) => {
  if (typeof window > "u")
    return 1;
  try {
    const t = window.localStorage.getItem(e ?? VS);
    return t ? Number(t) : 1;
  } catch {
    return 1;
  }
}, Fp = "player-comp", zS = ({
  children: e,
  timelineContext: t,
  playbackRateContext: n,
  preservePitch: r,
  fps: o,
  compositionHeight: i,
  compositionWidth: s,
  durationInFrames: a,
  component: u,
  numberOfSharedAudioTags: c,
  initiallyMuted: d,
  logLevel: m,
  audioLatencyHint: f,
  sampleRate: v,
  volumePersistenceKey: h,
  initialVolume: w,
  inputProps: x,
  audioEnabled: g,
  _experimentalKeepAudioContextAlive: p
}) => {
  const y = w === void 0, C = l.useMemo(() => ({
    compositions: [
      {
        component: u,
        durationInFrames: a,
        height: i,
        width: s,
        fps: o,
        id: Fp,
        order: null,
        folderName: null,
        parentFolderName: null,
        schema: null,
        calculateMetadata: null,
        stack: null
      }
    ],
    folders: [],
    currentAssetMetadata: null,
    currentCompositionMetadata: {
      defaultCodec: null,
      defaultOutName: null,
      defaultPixelFormat: null,
      defaultProResProfile: null,
      defaultSampleRate: null,
      defaultVideoImageFormat: null,
      durationInFrames: a,
      fps: o,
      height: i,
      width: s,
      props: x
    },
    canvasContent: { type: "composition", compositionId: "player-comp" }
  }), [
    u,
    a,
    i,
    s,
    o,
    x
  ]), [b, E] = l.useState(() => d), [k, P] = l.useState(() => y ? I5(h ?? null) : w), F = l.useMemo(() => ({
    playerMuted: b,
    mediaVolume: k
  }), [b, k]), I = l.useRef(!1), L = I.current || g && !b && k > 0;
  I.current = L;
  const _ = l.useCallback((V) => {
    P(V), y && P5(V, m, h ?? null);
  }, [y, m, h]), O = l.useMemo(() => ({
    setPlayerMuted: E,
    setMediaVolume: _
  }), [_]), N = l.useMemo(() => ({
    logLevel: m,
    mountTime: Date.now()
  }), [m]), j = l.useMemo(() => ({
    isPlayer: !0,
    isRendering: !1,
    isStudio: !1,
    isClientSideRendering: !1,
    isReadOnlyStudio: !1
  }), []);
  return /* @__PURE__ */ S.jsx(G.RemotionEnvironmentContext.Provider, {
    value: j,
    children: /* @__PURE__ */ S.jsx(G.LogLevelContext.Provider, {
      value: N,
      children: /* @__PURE__ */ S.jsx(G.CanUseRemotionHooksProvider, {
        children: /* @__PURE__ */ S.jsx(G.AbsoluteTimeContext.Provider, {
          value: t,
          children: /* @__PURE__ */ S.jsx(G.PlaybackRateContext.Provider, {
            value: n,
            children: /* @__PURE__ */ S.jsx(G.PlaybackPitchContext.Provider, {
              value: r,
              children: /* @__PURE__ */ S.jsx(G.TimelineContext.Provider, {
                value: t,
                children: /* @__PURE__ */ S.jsx(G.CompositionManager.Provider, {
                  value: C,
                  children: /* @__PURE__ */ S.jsx(G.VideoProvider, {
                    children: /* @__PURE__ */ S.jsx(G.PrefetchProvider, {
                      children: /* @__PURE__ */ S.jsx(G.DurationsContextProvider, {
                        children: /* @__PURE__ */ S.jsx(G.MediaVolumeContext.Provider, {
                          value: F,
                          children: /* @__PURE__ */ S.jsx(G.SetMediaVolumeContext.Provider, {
                            value: O,
                            children: /* @__PURE__ */ S.jsx(G.BufferingProvider, {
                              children: /* @__PURE__ */ S.jsx(G.SharedAudioContextProvider, {
                                audioLatencyHint: f,
                                audioEnabled: L,
                                previewSampleRate: v,
                                _experimentalKeepAudioContextAlive: p,
                                children: /* @__PURE__ */ S.jsx(G.SharedAudioTagsContextProvider, {
                                  numberOfAudioTags: c,
                                  children: e
                                })
                              })
                            })
                          })
                        })
                      })
                    })
                  })
                })
              })
            })
          })
        })
      })
    })
  });
}, gg = !1, T5 = (e, t) => {
  e || gg || (gg = !0, G.Log.warn({ logLevel: t, tag: null }, "Note: Some companies are required to obtain a license to use Remotion. See: https://remotion.dev/license\nPass the `acknowledgeRemotionLicense` prop to `<Player />` function to make this message disappear."));
}, yg = (e, t) => {
  if (typeof e > "u" || e === null)
    return e ?? null;
  if (typeof e != "number")
    throw new TypeError(`"${t}" must be a number, but is ${JSON.stringify(e)}`);
  if (Number.isNaN(e))
    throw new TypeError(`"${t}" must not be NaN, but is ${JSON.stringify(e)}`);
  if (!Number.isFinite(e))
    throw new TypeError(`"${t}" must be finite, but is ${JSON.stringify(e)}`);
  if (e % 1 !== 0)
    throw new TypeError(`"${t}" must be an integer, but is ${JSON.stringify(e)}`);
  return e;
}, R5 = ({
  inFrame: e,
  durationInFrames: t,
  outFrame: n
}) => {
  const r = yg(e, "inFrame"), o = yg(n, "outFrame");
  if (!(r === null && o === null)) {
    if (r !== null && r > t - 1)
      throw new Error("inFrame must be less than (durationInFrames - 1), but is " + r);
    if (o !== null && o > t - 1)
      throw new Error("outFrame must be less than (durationInFrames - 1), but is " + o);
    if (r !== null && r < 0)
      throw new Error("inFrame must be greater than 0, but is " + r);
    if (o !== null && o <= 0)
      throw new Error(`outFrame must be greater than 0, but is ${o}. If you want to render a single frame, use <Thumbnail /> instead.`);
    if (o !== null && r !== null && o <= r)
      throw new Error("outFrame must be greater than inFrame, but is " + o + " <= " + r);
  }
}, F5 = ({
  initialFrame: e,
  durationInFrames: t
}) => {
  if (typeof t != "number")
    throw new Error(`\`durationInFrames\` must be a number, but is ${JSON.stringify(t)}`);
  if (!(typeof e > "u")) {
    if (typeof e != "number")
      throw new Error(`\`initialFrame\` must be a number, but is ${JSON.stringify(e)}`);
    if (Number.isNaN(e))
      throw new Error("`initialFrame` must be a number, but is NaN");
    if (!Number.isFinite(e))
      throw new Error("`initialFrame` must be a number, but is Infinity");
    if (e % 1 !== 0)
      throw new Error(`\`initialFrame\` must be an integer, but is ${JSON.stringify(e)}`);
    if (e > t - 1)
      throw new Error(`\`initialFrame\` must be less or equal than \`durationInFrames - 1\`, but is ${JSON.stringify(e)}`);
  }
}, M5 = (e) => {
  if (e !== void 0) {
    if (e > 10)
      throw new Error(`The highest possible playback rate is 10. You passed: ${e}`);
    if (e < -10)
      throw new Error(`The lowest possible playback rate is -10. You passed: ${e}`);
    if (e === 0)
      throw new Error("A playback rate of 0 is not supported.");
  }
}, N5 = Go.validateFps, wg = Go.validateDimension, $5 = Go.validateDurationInFrames, _5 = Go.validateDefaultAndInputProps, A5 = (e) => "component" in e ? e.component : null, L5 = ({ onTimelineSequenceChange: e }) => {
  const t = D.useContext(G.SequenceRegistryContext);
  return l.useLayoutEffect(() => {
    if (t === null)
      throw new Error("Timeline sequence observer requires a sequence registry");
    const n = () => e(t.getSnapshot()), r = t.subscribe(n);
    return n(), r;
  }, [e, t]), null;
}, O5 = ({
  durationInFrames: e,
  compositionHeight: t,
  compositionWidth: n,
  fps: r,
  inputProps: o,
  style: i,
  controls: s = !1,
  loop: a = !1,
  autoPlay: u = !1,
  showVolumeControls: c = !0,
  allowFullscreen: d = !0,
  clickToPlay: m,
  doubleClickToFullscreen: f = !1,
  spaceKeyToPlayOrPause: v = !0,
  moveToBeginningWhenEnded: h = !0,
  numberOfSharedAudioTags: w = 5,
  errorFallback: x = () => "⚠️",
  playbackRate: g = 1,
  preservePitch: p = !1,
  renderLoading: y,
  className: C,
  showPosterWhenUnplayed: b,
  showPosterWhenEnded: E,
  showPosterWhenPaused: k,
  showPosterWhenBuffering: P,
  showPosterWhenBufferingAndPaused: F,
  initialFrame: I,
  renderPoster: L,
  inFrame: _,
  outFrame: O,
  initiallyShowControls: N,
  renderFullscreenButton: j,
  renderPlayPauseButton: V,
  renderVolumeSlider: B,
  renderCustomControls: A,
  alwaysShowControls: T = !1,
  initiallyMuted: M = !1,
  showPlaybackRateControl: R = !1,
  posterFillMode: $ = "player-size",
  bufferStateDelayInMilliseconds: z,
  defaultPremountInSeconds: q = Go.DEFAULT_PREMOUNT_IN_SECONDS,
  hideControlsWhenPointerDoesntMove: H = !0,
  overflowVisible: U = !1,
  renderMuteButton: K,
  browserMediaControlsBehavior: Q,
  overrideInternalClassName: X,
  logLevel: J = "info",
  noSuspense: oe,
  acknowledgeRemotionLicense: Z,
  audioLatencyHint: le = "playback",
  sampleRate: de = 48e3,
  volumePersistenceKey: pt,
  initialVolume: we,
  _experimentalKeepAudioContextAlive: Re = !1,
  ...ee
}, Oe) => {
  Go.validateDefaultPremountInSeconds(q), typeof window < "u" && (window.remotion_isPlayer = !0);
  const be = D.useContext(F3);
  if (ee.defaultProps !== void 0)
    throw new Error("The <Player /> component does not accept `defaultProps`, but some were passed. Use `inputProps` instead.");
  const $e = A5(ee);
  if ($e?.type === ku)
    throw new TypeError("'component' should not be an instance of <Composition/>. Pass the React component directly, and set the duration, fps and dimensions as separate props. See https://www.remotion.dev/docs/player/examples for an example.");
  if ($e === ku)
    throw new TypeError("'component' must not be the 'Composition' component. Pass your own React component directly, and set the duration, fps and dimensions as separate props. See https://www.remotion.dev/docs/player/examples for an example.");
  l.useState(() => T5(!!Z, J));
  const ie = G.useLazyComponent({
    compProps: ee,
    componentName: "Player",
    noSuspense: !!oe
  });
  F5({ initialFrame: I, durationInFrames: e });
  const [Ee, pe] = l.useState(() => ({
    [Fp]: I ?? 0
  })), Et = G.useTimelineSeek(pe), rt = l.useRef(Ee);
  rt.current = Ee;
  const je = l.useRef(null), Ue = l.useRef([]), We = l.useMemo(() => G.createRuntimeValueStore({ playing: !1 }), []), Lt = l.useMemo(() => G.createRuntimeValueStore({ buffering: !1 }), []), ot = l.useCallback(() => We.store.getSnapshot().playing, [We]), ke = l.useCallback(() => Lt.store.getSnapshot().buffering, [Lt]), [Ot, yn] = l.useState(g);
  if (typeof t != "number")
    throw new TypeError(`'compositionHeight' must be a number but got '${typeof t}' instead`);
  if (typeof n != "number")
    throw new TypeError(`'compositionWidth' must be a number but got '${typeof n}' instead`);
  if (wg(t, "compositionHeight", "of the <Player /> component"), wg(n, "compositionWidth", "of the <Player /> component"), $5(e, {
    component: "of the <Player/> component",
    allowFloats: !1
  }), N5(r, "as a prop of the <Player/> component", !1), _5(o, "inputProps", null), R5({
    durationInFrames: e,
    inFrame: _,
    outFrame: O
  }), typeof s != "boolean" && typeof s < "u")
    throw new TypeError(`'controls' must be a boolean or undefined but got '${typeof s}' instead`);
  if (typeof p != "boolean")
    throw new TypeError(`'preservePitch' must be a boolean but got '${typeof p}' instead`);
  if (typeof u != "boolean" && typeof u < "u")
    throw new TypeError(`'autoPlay' must be a boolean or undefined but got '${typeof u}' instead`);
  if (typeof a != "boolean" && typeof a < "u")
    throw new TypeError(`'loop' must be a boolean or undefined but got '${typeof a}' instead`);
  if (typeof f != "boolean" && typeof f < "u")
    throw new TypeError(`'doubleClickToFullscreen' must be a boolean or undefined but got '${typeof f}' instead`);
  if (typeof c != "boolean" && typeof c < "u")
    throw new TypeError(`'showVolumeControls' must be a boolean or undefined but got '${typeof c}' instead`);
  if (typeof d != "boolean" && typeof d < "u")
    throw new TypeError(`'allowFullscreen' must be a boolean or undefined but got '${typeof d}' instead`);
  if (typeof m != "boolean" && typeof m < "u")
    throw new TypeError(`'clickToPlay' must be a boolean or undefined but got '${typeof m}' instead`);
  if (typeof v != "boolean" && typeof v < "u")
    throw new TypeError(`'spaceKeyToPlayOrPause' must be a boolean or undefined but got '${typeof v}' instead`);
  if (typeof de != "number" || !Number.isFinite(de) || Number.isNaN(de) || de <= 0 || de % 1 !== 0)
    throw new TypeError(`'sampleRate' must be a positive integer but got '${de}' instead`);
  if (typeof we < "u" && typeof we != "number")
    throw new TypeError(`'initialVolume' must be a number or undefined but got '${typeof we}' instead`);
  if (typeof we == "number" && (!Number.isFinite(we) || Number.isNaN(we) || we < 0 || we > 1))
    throw new TypeError(`'initialVolume' must be between 0 and 1 but got '${we}' instead`);
  if (typeof w != "number" || w % 1 !== 0 || !Number.isFinite(w) || Number.isNaN(w) || w < 0)
    throw new TypeError(`'numberOfSharedAudioTags' must be an integer but got '${w}' instead`);
  M5(Ot), l.useEffect(() => {
    yn(g);
  }, [g]), l.useImperativeHandle(Oe, () => je.current, []), l.useState(() => {
    G.playbackLogging({
      logLevel: J,
      message: `[player] Mounting <Player>. User agent = ${typeof navigator > "u" ? "server" : navigator.userAgent}`,
      tag: "player",
      mountTime: Date.now()
    });
  });
  const wn = l.useMemo(() => ({
    frame: Ee,
    isPlaying: ot,
    isInsideFreeze: !1,
    audioAndVideoTags: Ue
  }), [Ee, ot]), Dn = l.useMemo(() => ({
    playbackRate: Ot,
    setPlaybackRate: yn
  }), [Ot]), jt = l.useMemo(() => ({
    setFrameWithoutSeek: pe,
    seek: Et,
    setPlaying: (it) => {
      const Vn = We.store.getSnapshot().playing, zn = typeof it == "function" ? it(Vn) : it;
      Vn !== zn && We.setSnapshot({ playing: zn });
    },
    setBuffering: (it) => {
      ke() !== it && Lt.setSnapshot({ buffering: it });
    },
    subscribePlaying: We.store.subscribe,
    subscribeBuffering: Lt.store.subscribe,
    isPlaying: ot,
    isBuffering: ke,
    frameRef: rt,
    audioAndVideoTags: Ue
  }), [
    Lt,
    Et,
    pe,
    rt,
    We,
    ke,
    ot
  ]);
  typeof window < "u" && l.useLayoutEffect(() => {
    G.CSSUtils.injectCSS(G.CSSUtils.makeDefaultPreviewCSS(`.${Rp(X)}`, "#fff"));
  }, [X]);
  const Xt = l.useMemo(() => o ?? {}, [o]), Qr = l.useMemo(() => Q ?? {
    mode: "prevent-media-session"
  }, [Q]), ht = /* @__PURE__ */ S.jsx(G.IsPlayerContextProvider, {
    children: /* @__PURE__ */ S.jsx(G.SetTimelineContext.Provider, {
      value: jt,
      children: /* @__PURE__ */ S.jsx(zS, {
        timelineContext: wn,
        playbackRateContext: Dn,
        preservePitch: p,
        component: ie,
        compositionHeight: t,
        compositionWidth: n,
        durationInFrames: e,
        fps: r,
        numberOfSharedAudioTags: w,
        initiallyMuted: M,
        logLevel: J,
        audioLatencyHint: le,
        sampleRate: de,
        _experimentalKeepAudioContextAlive: Re,
        volumePersistenceKey: pt,
        initialVolume: we,
        inputProps: Xt,
        audioEnabled: !0,
        children: /* @__PURE__ */ S.jsx(R3, {
          currentPlaybackRate: Ot,
          children: /* @__PURE__ */ S.jsx(k5, {
            ref: je,
            posterFillMode: $,
            renderLoading: y,
            autoPlay: !!u,
            loop: !!a,
            controls: !!s,
            errorFallback: x,
            style: i,
            inputProps: Xt,
            allowFullscreen: !!d,
            moveToBeginningWhenEnded: !!h,
            clickToPlay: typeof m == "boolean" ? m : !!s,
            showVolumeControls: !!c,
            doubleClickToFullscreen: !!f,
            spaceKeyToPlayOrPause: !!v,
            playbackRate: Ot,
            className: C ?? void 0,
            showPosterWhenUnplayed: !!b,
            showPosterWhenEnded: !!E,
            showPosterWhenPaused: !!k,
            showPosterWhenBuffering: !!P,
            showPosterWhenBufferingAndPaused: !!F,
            renderPoster: L,
            inFrame: _ ?? null,
            outFrame: O ?? null,
            initiallyShowControls: N ?? !0,
            renderFullscreen: j ?? null,
            renderPlayPauseButton: V ?? null,
            renderMuteButton: K ?? null,
            renderVolumeSlider: B ?? null,
            renderCustomControls: A ?? null,
            alwaysShowControls: T,
            showPlaybackRateControl: R,
            bufferStateDelayInMilliseconds: z ?? 300,
            hideControlsWhenPointerDoesntMove: H,
            overflowVisible: U,
            browserMediaControlsBehavior: Qr,
            overrideInternalClassName: X ?? void 0,
            noSuspense: !!oe
          })
        })
      })
    })
  });
  return /* @__PURE__ */ S.jsx(G.DefaultPremountContext.Provider, {
    value: q,
    children: be ? /* @__PURE__ */ S.jsx(G.SequenceRegistrationContext.Provider, {
      value: !0,
      children: /* @__PURE__ */ S.jsxs(G.SequenceManagerProvider, {
        children: [
          /* @__PURE__ */ S.jsx(L5, {
            onTimelineSequenceChange: be
          }),
          ht
        ]
      })
    }) : ht
  });
}, j5 = l.forwardRef, D5 = j5(O5), V5 = () => {
  const e = l.useContext(LS);
  if (!e)
    throw new TypeError("Expected Player event emitter context");
  return l.useMemo(() => ({
    emitter: e
  }), [e]);
}, yf = D.version.split(".")[0];
if (yf === "0")
  throw new Error(`Version ${yf} of "react" is not supported by Remotion`);
var z5 = parseInt(yf, 10) >= 18, B5 = ({
  style: e,
  inputProps: t,
  errorFallback: n,
  renderLoading: r,
  className: o,
  overflowVisible: i,
  noSuspense: s,
  overrideInternalClassName: a
}, u) => {
  const c = G.useUnsafeVideoConfig(), d = G.useVideo(), m = l.useRef(null), f = Tp(m, {
    triggerOnWindowResize: !1,
    shouldApplyCssTransforms: !1
  }), v = l.useMemo(() => !c || !f ? null : MS({
    canvasSize: f,
    compositionHeight: c.height,
    compositionWidth: c.width,
    previewSize: "auto"
  }), [f, c]), h = v?.scale ?? 1, w = V5();
  OS(w.emitter), l.useImperativeHandle(u, () => {
    const P = {
      getContainerNode: () => m.current,
      getScale: () => h
    };
    return Object.assign(w.emitter, P);
  }, [h, w.emitter]);
  const x = d ? d.component : null, g = l.useMemo(() => NS({
    config: c,
    style: e,
    canvasSize: f,
    overflowVisible: i,
    layout: v
  }), [f, c, v, i, e]), p = l.useMemo(() => _S({ config: c, layout: v, scale: h, overflowVisible: i }), [c, v, i, h]), y = l.useMemo(() => $S({
    config: c,
    layout: v,
    scale: h,
    overflowVisible: i
  }), [c, v, i, h]), C = l.useCallback((P) => {
    w.emitter.dispatchError(P);
  }, [w.emitter]), b = l.useMemo(() => r ? r({
    height: g.height,
    width: g.width,
    isBuffering: !1
  }) : null, [g.height, g.width, r]), E = l.useMemo(() => ({
    type: "scale",
    scale: h
  }), [h]);
  if (!c)
    return null;
  const k = /* @__PURE__ */ S.jsx("div", {
    style: p,
    children: /* @__PURE__ */ S.jsx("div", {
      style: y,
      className: Rp(a),
      children: x ? /* @__PURE__ */ S.jsx(jS, {
        onError: C,
        errorFallback: n,
        children: /* @__PURE__ */ S.jsx(G.CurrentScaleContext.Provider, {
          value: E,
          children: /* @__PURE__ */ S.jsx(x, {
            ...d?.props ?? {},
            ...t ?? {}
          })
        })
      }) : null
    })
  });
  return s || DS && !z5 ? /* @__PURE__ */ S.jsx("div", {
    ref: m,
    style: g,
    className: o,
    children: k
  }) : /* @__PURE__ */ S.jsx("div", {
    ref: m,
    style: g,
    className: o,
    children: /* @__PURE__ */ S.jsx(l.Suspense, {
      fallback: b,
      children: k
    })
  });
}, U5 = l.forwardRef(B5), W5 = ({
  frameToDisplay: e,
  style: t,
  inputProps: n,
  compositionHeight: r,
  compositionWidth: o,
  durationInFrames: i,
  fps: s,
  className: a,
  errorFallback: u = () => "⚠️",
  renderLoading: c,
  overflowVisible: d = !1,
  overrideInternalClassName: m,
  logLevel: f = "info",
  noSuspense: v,
  ...h
}, w) => {
  typeof window < "u" && l.useLayoutEffect(() => {
    window.remotion_isPlayer = !0;
  }, []);
  const x = l.useRef(null), g = l.useRef([]), p = l.useMemo(() => G.createRuntimeValueStore({ buffering: !1 }), []), y = l.useMemo(() => ({
    isPlaying: () => !1,
    isInsideFreeze: !1,
    frame: {
      [Fp]: e
    },
    audioAndVideoTags: g
  }), [e]), C = l.useMemo(() => ({
    playbackRate: 1,
    setPlaybackRate: () => {
      throw new Error("thumbnail");
    }
  }), []), b = l.useRef(y.frame);
  b.current = y.frame;
  const E = l.useMemo(() => ({
    setFrameWithoutSeek: () => {
    },
    seek: null,
    setPlaying: () => {
    },
    setBuffering: (I) => {
      p.store.getSnapshot().buffering !== I && p.setSnapshot({ buffering: I });
    },
    subscribePlaying: () => () => {
    },
    subscribeBuffering: p.store.subscribe,
    isPlaying: () => !1,
    isBuffering: () => p.store.getSnapshot().buffering,
    frameRef: b,
    audioAndVideoTags: g
  }), [p]);
  l.useImperativeHandle(w, () => x.current, []);
  const k = G.useLazyComponent({
    compProps: h,
    componentName: "Thumbnail",
    noSuspense: !!v
  }), [P] = l.useState(() => new T3()), F = l.useMemo(() => n ?? {}, [n]);
  return /* @__PURE__ */ S.jsx(G.IsPlayerContextProvider, {
    children: /* @__PURE__ */ S.jsx(G.SetTimelineContext.Provider, {
      value: E,
      children: /* @__PURE__ */ S.jsx(zS, {
        timelineContext: y,
        playbackRateContext: C,
        preservePitch: !1,
        component: k,
        compositionHeight: r,
        compositionWidth: o,
        durationInFrames: i,
        fps: s,
        numberOfSharedAudioTags: 0,
        initiallyMuted: !0,
        logLevel: f,
        audioLatencyHint: "playback",
        sampleRate: 48e3,
        inputProps: F,
        audioEnabled: !1,
        _experimentalKeepAudioContextAlive: !1,
        children: /* @__PURE__ */ S.jsx(LS.Provider, {
          value: P,
          children: /* @__PURE__ */ S.jsx(U5, {
            ref: x,
            className: a,
            errorFallback: u,
            inputProps: F,
            renderLoading: c,
            style: t,
            overflowVisible: d,
            overrideInternalClassName: m,
            noSuspense: !!v
          })
        })
      })
    })
  });
}, q5 = l.forwardRef;
q5(W5);
/**
 * @license lucide-react v1.65.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const H5 = (e) => e?.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
/**
 * @license lucide-react v1.65.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
function K5(e, t, n = []) {
  if (t == null)
    throw new Error("[lucide]: iconNode is required when icon name is used");
  return {
    name: H5(e),
    size: 24,
    node: t,
    ...n.length > 0 ? { aliases: n } : {}
  };
}
/**
 * @license lucide-react v1.65.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const G5 = (e) => {
  let t = "", n = !1;
  for (const r of e) {
    if (r === "-" || r === "_" || r <= " ") {
      n = t.length > 0;
      continue;
    }
    t.length === 0 ? t += r.toLowerCase() : t += n ? r.toUpperCase() : r, n = !1;
  }
  return t;
};
/**
 * @license lucide-react v1.65.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Y5 = (e) => {
  const t = G5(e);
  return t.charAt(0).toUpperCase() + t.slice(1);
};
/**
 * @license lucide-react v1.65.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const wf = (...e) => e.filter((t, n, r) => !!t && t.trim() !== "" && r.indexOf(t) === n).join(" ").trim();
/**
 * @license lucide-react v1.65.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const vr = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 2,
  "stroke-linecap": "round",
  "stroke-linejoin": "round"
};
/**
 * @license lucide-react v1.65.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
function zc(e) {
  return e != null;
}
function Q5(e, t = {}) {
  const n = t.attributeNames ?? {}, r = (f) => n[f] ?? f, o = e.size ?? e.width ?? vr.width, i = e.size ?? e.height ?? vr.height, s = e.aliases?.filter((f) => typeof f == "string" && f.trim() !== "").map((f) => `lucide-${f}`) ?? [], a = [...e.name ? [`lucide-${e.name}`] : [], ...s], u = t.className?.split(" ").filter(Boolean) ?? [], c = t.includeDefaultClasses === !1 ? wf(...u) : wf("lucide", ...a, ...u), d = t.absoluteStrokeWidth ? Number(t.strokeWidth ?? vr["stroke-width"]) * Number(e.size ?? e.width ?? vr.width) / Number(t.size ?? t.width ?? vr.width) : t.strokeWidth ?? vr["stroke-width"];
  return [
    "svg",
    {
      ...Object.entries(vr).reduce((f, [v, h]) => (f[r(v)] = h, f), {}),
      ..."color" in t && t.color && {
        [r("stroke")]: t.color
      },
      ..."size" in t && zc(t.size) && {
        [r("width")]: t.size,
        [r("height")]: t.size
      },
      ..."width" in t && zc(t.width) && {
        [r("width")]: t.width
      },
      ..."height" in t && zc(t.height) && {
        [r("height")]: t.height
      },
      [r("stroke-width")]: d,
      ...c && {
        [r("class")]: c
      },
      [r("viewBox")]: `0 0 ${o} ${i}`,
      ...t.hasA11yProp === !1 ? {
        [r("aria-hidden")]: "true"
      } : {},
      ..."attributes" in t && t.attributes
    },
    e.node.map((f) => {
      const [v, h, w] = f, x = t.nonScalingStroke ? { [r("vector-effect")]: "non-scaling-stroke", ...h } : h;
      return w ? [v, x, w] : [v, x];
    })
  ];
}
/**
 * @license lucide-react v1.65.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
function J5(e, t = {}) {
  return Q5(e, {
    ...t,
    attributeNames: {
      ...t.attributeNames,
      class: "className",
      "stroke-width": "strokeWidth",
      "stroke-linecap": "strokeLinecap",
      "stroke-linejoin": "strokeLinejoin",
      "vector-effect": "vectorEffect"
    }
  });
}
/**
 * @license lucide-react v1.65.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Z5 = (e) => {
  for (const t in e)
    if (t.startsWith("aria-") || t === "role" || t === "title")
      return !0;
  return !1;
}, X5 = l.createContext({}), eF = () => l.useContext(X5), tF = l.forwardRef(
  ({
    color: e,
    size: t,
    width: n,
    height: r,
    strokeWidth: o,
    absoluteStrokeWidth: i,
    nonScalingStroke: s,
    className: a = "",
    children: u,
    iconNode: c = [],
    icon: d = {
      node: c,
      aliases: [],
      size: 24
    },
    ...m
  }, f) => {
    const {
      size: v = 24,
      strokeWidth: h = 2,
      absoluteStrokeWidth: w = !1,
      nonScalingStroke: x = !1,
      color: g = "currentColor",
      className: p = ""
    } = eF() ?? {}, y = !!u || Z5(m), [C, b, E = []] = J5(d, {
      color: e ?? g,
      width: n ?? t ?? v,
      height: r ?? t ?? v,
      strokeWidth: o ?? h,
      absoluteStrokeWidth: i ?? w,
      nonScalingStroke: s ?? x,
      className: wf(p, a),
      hasA11yProp: y,
      attributes: m
    });
    return l.createElement(
      C,
      {
        ref: f,
        ...b
      },
      [
        ...E.map(([k, P]) => l.createElement(k, P)),
        ...Array.isArray(u) ? u : [u]
      ]
    );
  }
);
/**
 * @license lucide-react v1.65.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
function ii(e, t = [], n = []) {
  const r = typeof e == "string" ? K5(e, t, n) : e, o = l.forwardRef(
    ({ className: i, ...s }, a) => l.createElement(tF, {
      ref: a,
      icon: r,
      className: i,
      ...s
    })
  );
  return r.name && (o.displayName = Y5(r.name)), o;
}
/**
 * @license lucide-react v1.65.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const BS = {
  name: "calendar-days",
  size: 24,
  node: [
    ["path", { d: "M8 2v3", key: "1ioesn" }],
    ["path", { d: "M16 2v3", key: "otl347" }],
    ["rect", { x: "3", y: "3", width: "18", height: "18", rx: "2", key: "h1oib" }],
    ["path", { d: "M3 9h18", key: "1pudct" }],
    ["path", { d: "M8 13h.01", key: "1sbv64" }],
    ["path", { d: "M12 13h.01", key: "y0uutt" }],
    ["path", { d: "M16 13h.01", key: "wip0gl" }],
    ["path", { d: "M8 17h.01", key: "p3bg7i" }],
    ["path", { d: "M12 17h.01", key: "p32p05" }],
    ["path", { d: "M16 17h.01", key: "ql8jdd" }]
  ]
};
BS.node;
const nF = ii(BS);
/**
 * @license lucide-react v1.65.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const US = {
  name: "circle-check",
  size: 24,
  node: [
    ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
    ["path", { d: "m16 9-5.5 5.5L8 12", key: "xofnsj" }]
  ],
  aliases: ["check-circle-2"]
};
US.node;
const Sg = ii(US);
/**
 * @license lucide-react v1.65.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const WS = {
  name: "clipboard-check",
  size: 24,
  node: [
    ["rect", { width: "8", height: "4", x: "8", y: "2", rx: "1", ry: "1", key: "tgr4d6" }],
    [
      "path",
      {
        d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
        key: "116196"
      }
    ],
    ["path", { d: "m9 14 2 2 4-4", key: "df797q" }]
  ]
};
WS.node;
const rF = ii(WS);
/**
 * @license lucide-react v1.65.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const qS = {
  name: "graduation-cap",
  size: 24,
  node: [
    [
      "path",
      {
        d: "M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z",
        key: "j76jl0"
      }
    ],
    ["path", { d: "M22 10v6", key: "1lu8f3" }],
    ["path", { d: "M6 12.5V16a6 3 0 0 0 12 0v-3.5", key: "1r8lef" }]
  ]
};
qS.node;
const oF = ii(qS);
/**
 * @license lucide-react v1.65.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const HS = {
  name: "user-round",
  size: 24,
  node: [
    ["circle", { cx: "12", cy: "8", r: "5", key: "1hypcn" }],
    ["path", { d: "M20 21a8 8 0 0 0-16 0", key: "rfgkzh" }]
  ],
  aliases: ["user-2"]
};
HS.node;
const iF = ii(HS);
/**
 * @license lucide-react v1.65.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const KS = {
  name: "users-round",
  size: 24,
  node: [
    ["path", { d: "M18 21a8 8 0 0 0-16 0", key: "3ypg7q" }],
    ["circle", { cx: "10", cy: "8", r: "5", key: "o932ke" }],
    ["path", { d: "M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3", key: "10s06x" }]
  ],
  aliases: ["users-2"]
};
KS.node;
const sF = ii(KS), GS = 1400, YS = 560, xg = 120, aF = 30, on = "#d0cde4", gr = "#ada4cc", uF = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };
function sn(e, t, n = 28) {
  return 1 - (1 - Kr(e, [t, t + n], [0, 1], uF)) ** 3;
}
function xn({ d: e, frame: t, start: n = 0, duration: r = 40, opacity: o = 1 }) {
  const i = sn(t, n, r);
  return /* @__PURE__ */ S.jsx(
    "path",
    {
      d: e,
      pathLength: 1,
      strokeDasharray: 1,
      strokeDashoffset: 1 - i,
      fill: "none",
      stroke: on,
      strokeWidth: 1.25,
      strokeLinecap: "round",
      opacity: i === 0 ? 0 : o
    }
  );
}
function QS({ frame: e }) {
  const t = sn(e, 0, 44), n = sn(e, 14, 24), r = [
    { x: 1008, y: 156, radius: 33, Icon: iF, start: 40 },
    { x: 1312, y: 168, radius: 37, Icon: rF, start: 50 },
    { x: 1015, y: 389, radius: 29, Icon: sF, start: 66 },
    { x: 1300, y: 387, radius: 30, Icon: Sg, start: 82 }
  ];
  return /* @__PURE__ */ S.jsxs(
    "svg",
    {
      viewBox: `0 0 ${GS} ${YS}`,
      width: "100%",
      height: "100%",
      xmlns: "http://www.w3.org/2000/svg",
      fill: "none",
      "aria-hidden": "true",
      "data-imprint-frame": e,
      children: [
        /* @__PURE__ */ S.jsxs("g", { transform: "rotate(-8 250 280)", children: [
          /* @__PURE__ */ S.jsx(
            "rect",
            {
              x: "92",
              y: "142",
              width: "320",
              height: "274",
              rx: "18",
              stroke: on,
              strokeWidth: "1.3",
              pathLength: 1,
              strokeDasharray: 1,
              strokeDashoffset: 1 - t,
              opacity: t === 0 ? 0 : 0.95
            }
          ),
          /* @__PURE__ */ S.jsxs("g", { opacity: n * 0.85, children: [
            /* @__PURE__ */ S.jsx(nF, { x: 111, y: 164, width: 20, height: 20, color: gr, strokeWidth: 1.25 }),
            /* @__PURE__ */ S.jsx("text", { x: "141", y: "180", fill: gr, fontSize: "13", letterSpacing: "2", children: "每一节课" }),
            /* @__PURE__ */ S.jsx("path", { d: "M354 174h25m-25 6h17", stroke: on, strokeWidth: "1.5", strokeLinecap: "round" })
          ] }),
          /* @__PURE__ */ S.jsx(xn, { d: "M93 199H411", frame: e, start: 13, duration: 36 }),
          ["一", "二", "三", "四"].map((o, i) => /* @__PURE__ */ S.jsx(
            "text",
            {
              x: 135 + i * 73,
              y: "222",
              textAnchor: "middle",
              fill: gr,
              fontSize: "11",
              opacity: sn(e, 22 + i * 3) * 0.65,
              children: o
            },
            o
          )),
          [107, 180, 253, 326, 399].map((o, i) => /* @__PURE__ */ S.jsx(
            xn,
            {
              d: `M${o} 233V405`,
              frame: e,
              start: 22 + i * 4,
              duration: 42,
              opacity: 0.65
            },
            `v${o}`
          )),
          [233, 291, 349, 405].map((o, i) => /* @__PURE__ */ S.jsx(
            xn,
            {
              d: `M107 ${o}H399`,
              frame: e,
              start: 28 + i * 5,
              duration: 36,
              opacity: 0.65
            },
            `h${o}`
          )),
          [
            [115, 242, 43],
            [261, 242, 49],
            [188, 300, 57],
            [334, 300, 65],
            [261, 358, 73],
            [115, 358, 81]
          ].map(([o, i, s], a) => {
            const u = sn(e, s, 25);
            return /* @__PURE__ */ S.jsxs("g", { opacity: u, transform: `translate(0 ${(1 - u) * 8})`, children: [
              /* @__PURE__ */ S.jsx(
                "rect",
                {
                  x: o,
                  y: i,
                  width: "56",
                  height: "38",
                  rx: "7",
                  fill: a % 2 ? "#c9c2eb" : "#bbc4e7",
                  fillOpacity: ".21",
                  stroke: on,
                  strokeOpacity: ".65",
                  strokeWidth: ".8"
                }
              ),
              /* @__PURE__ */ S.jsx("path", { d: `M${o + 11} ${i + 15}h23m-23 8h15`, stroke: gr, strokeWidth: "1", opacity: ".45", strokeLinecap: "round" })
            ] }, a);
          }),
          /* @__PURE__ */ S.jsxs("g", { opacity: sn(e, 83, 27) * 0.65, children: [
            /* @__PURE__ */ S.jsx("circle", { cx: "393", cy: "396", r: "15", fill: "#f8f7fd", stroke: on }),
            /* @__PURE__ */ S.jsx(Sg, { x: 384, y: 387, width: 18, height: 18, color: gr, strokeWidth: 1.25 })
          ] })
        ] }),
        /* @__PURE__ */ S.jsx(xn, { d: "M48 439C90 465 146 476 209 466", frame: e, start: 60, duration: 45, opacity: 0.45 }),
        /* @__PURE__ */ S.jsx("circle", { cx: "227", cy: "463", r: "3", fill: on, opacity: sn(e, 98, 15) * 0.6 }),
        /* @__PURE__ */ S.jsxs("g", { children: [
          /* @__PURE__ */ S.jsx(xn, { d: "M1034 177C1066 204 1082 214 1103 236", frame: e, start: 27, duration: 37, opacity: 0.8 }),
          /* @__PURE__ */ S.jsx(xn, { d: "M1277 185C1244 204 1234 220 1210 238", frame: e, start: 35, duration: 40, opacity: 0.8 }),
          /* @__PURE__ */ S.jsx(xn, { d: "M1039 372C1064 351 1085 329 1110 307", frame: e, start: 49, duration: 42, opacity: 0.8 }),
          /* @__PURE__ */ S.jsx(xn, { d: "M1276 367C1243 348 1228 325 1202 311", frame: e, start: 65, duration: 43, opacity: 0.8 }),
          /* @__PURE__ */ S.jsxs("g", { opacity: sn(e, 8, 34), children: [
            /* @__PURE__ */ S.jsx("circle", { cx: "1155", cy: "270", r: "64", stroke: on, strokeWidth: "1.3", fill: "#f2f0fa", fillOpacity: ".24" }),
            /* @__PURE__ */ S.jsx("circle", { cx: "1155", cy: "270", r: "83", stroke: on, strokeWidth: ".8", strokeDasharray: "3 12", opacity: ".45" }),
            /* @__PURE__ */ S.jsx(oF, { x: 1133, y: 247, width: 44, height: 44, color: gr, strokeWidth: 1.15, opacity: 0.8 })
          ] }),
          r.map(({ x: o, y: i, radius: s, Icon: a, start: u }, c) => {
            const d = sn(e, u, 28);
            return /* @__PURE__ */ S.jsxs("g", { opacity: d, transform: `translate(0 ${(1 - d) * 6})`, children: [
              /* @__PURE__ */ S.jsx("circle", { cx: o, cy: i, r: s, stroke: on, strokeWidth: "1.15", fill: "#f8f8fd", fillOpacity: ".45" }),
              /* @__PURE__ */ S.jsx(a, { x: o - 12, y: i - 12, width: 24, height: 24, color: gr, strokeWidth: 1.15, opacity: ".82" })
            ] }, c);
          }),
          /* @__PURE__ */ S.jsx(xn, { d: "M1277 91C1307 93 1335 109 1349 131", frame: e, start: 65, duration: 40, opacity: 0.4 }),
          /* @__PURE__ */ S.jsx("circle", { cx: "1259", cy: "92", r: "3", fill: on, opacity: sn(e, 91, 18) * 0.6 })
        ] })
      ]
    }
  );
}
function lF() {
  return /* @__PURE__ */ S.jsx(QS, { frame: hn() });
}
function cF() {
  const e = l.useRef(null), [t, n] = l.useState(() => typeof window > "u" || window.matchMedia("(prefers-reduced-motion: reduce), (max-width: 1000px), (max-height: 560px)").matches);
  return l.useEffect(() => {
    if (t) return;
    const r = e.current;
    if (!r) return;
    const o = () => n(!0), i = window.matchMedia("(prefers-reduced-motion: reduce)"), s = () => {
      i.matches && o();
    }, a = () => {
      document.hidden ? r.pause() : r.play();
    };
    return r.addEventListener("ended", o), r.addEventListener("error", o), i.addEventListener("change", s), document.addEventListener("visibilitychange", a), document.hidden && r.pause(), () => {
      r.removeEventListener("ended", o), r.removeEventListener("error", o), i.removeEventListener("change", s), document.removeEventListener("visibilitychange", a);
    };
  }, [t]), /* @__PURE__ */ S.jsx("div", { className: "imprint-surface", "data-imprint-state": t ? "settled" : "playing", children: t ? /* @__PURE__ */ S.jsx(QS, { frame: xg - 1 }) : /* @__PURE__ */ S.jsx(
    D5,
    {
      ref: e,
      component: lF,
      durationInFrames: xg,
      fps: aF,
      compositionWidth: GS,
      compositionHeight: YS,
      autoPlay: !0,
      loop: !1,
      controls: !1,
      moveToBeginningWhenEnded: !1,
      clickToPlay: !1,
      doubleClickToFullscreen: !1,
      spaceKeyToPlayOrPause: !1,
      allowFullscreen: !1,
      numberOfSharedAudioTags: 0,
      style: { width: "100%", height: "100%", pointerEvents: "none" }
    }
  ) });
}
const Cg = document.querySelector("#login-imprint");
Cg && Aw(Cg).render(/* @__PURE__ */ S.jsx(cF, {}));
