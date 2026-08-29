"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Branch = {
  id: string;
  name: string;
  code: string;
};

type Customer = {
  id: string;
  customer_code: string | null;
  full_name: string;
  phone: string | null;
};

type InventoryItem = {
  id: string;
  quantity: number;
  product: {
    id: string;
    sku: string;
    name: string;
    selling_price: number;
    track_serial: boolean;
  } | null;
};

type Serial = {
  id: string;
  product_id: string;
  serial_number: string;
  status: string;
};

type CartItem = {
  product_id: string;
  sku: string;
  name: string;
  serial_number_id: string;
  serial_number: string;
  unit_price: number;
};

type Props = {
  branch: Branch | null;
  customers: Customer[];
  inventory: InventoryItem[];
  serials: Serial[];
};

export function PosClient({
  branch,
  customers,
  inventory,
  serials,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [customerId, setCustomerId] = useState("");
  const [productId, setProductId] = useState("");
  const [serialId, setSerialId] = useState("");

  const [cart, setCart] = useState<CartItem[]>([]);

  const [paymentMethod, setPaymentMethod] =
    useState("cash");

  const [paymentAmount, setPaymentAmount] =
    useState("");

  const [paymentReference, setPaymentReference] =
    useState("");

  const [discountAmount, setDiscountAmount] =
    useState("0");

  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedInventory = inventory.find(
    (item) => item.product?.id === productId
  );

  const availableSerials = useMemo(() => {
    return serials.filter(
      (serial) =>
        serial.product_id === productId &&
        !cart.some(
          (item) =>
            item.serial_number_id === serial.id
        )
    );
  }, [serials, productId, cart]);

  const subtotal = cart.reduce(
    (sum, item) => sum + Number(item.unit_price),
    0
  );

  const discount =
    Number(discountAmount || 0);

  const total = Math.max(
    subtotal - discount,
    0
  );

  const payment = Number(paymentAmount || 0);

    const change =
    paymentMethod === "cash"
        ? Math.max(payment - total, 0)
        : 0;

  function addToCart() {
    setError("");

    if (!selectedInventory?.product) {
      setError("Select a product.");
      return;
    }

    if (!serialId) {
      setError("Select a serial number.");
      return;
    }

    const serial = serials.find(
      (item) => item.id === serialId
    );

    if (!serial) {
      setError("Serial number not found.");
      return;
    }

    setCart((current) => [
      ...current,
      {
        product_id:
          selectedInventory.product!.id,
        sku:
          selectedInventory.product!.sku,
        name:
          selectedInventory.product!.name,
        serial_number_id: serial.id,
        serial_number: serial.serial_number,
        unit_price: Number(
          selectedInventory.product!.selling_price
        ),
      },
    ]);

    setSerialId("");
  }

  function removeFromCart(
    serialNumberId: string
  ) {
    setCart((current) =>
      current.filter(
        (item) =>
          item.serial_number_id !==
          serialNumberId
      )
    );
  }

  async function checkout() {
    setError("");
    setSuccess("");

    if (!branch) {
      setError("Branch not found.");
      return;
    }

    if (cart.length === 0) {
      setError("Cart is empty.");
      return;
    }

    if (discount < 0) {
      setError("Invalid discount.");
      return;
    }

    if (discount > subtotal) {
      setError(
        "Discount cannot exceed subtotal."
      );
      return;
    }

    const payment = Number(paymentAmount);

    if (!paymentAmount || payment <= 0) {
    setError("Enter a payment amount.");
    return;
    }

    if (paymentMethod === "cash") {
    if (payment < total) {
        setError("Cash tendered is insufficient.");
        return;
    }
    } else {
    if (payment !== total) {
        setError(
        `For ${paymentMethod}, payment amount must equal the amount due.`
        );
        return;
    }

    if (!paymentReference.trim()) {
        setError("Reference number is required.");
        return;
    }
    }

    setLoading(true);

    const { data, error: checkoutError } =
      await supabase.rpc(
        "complete_sale",
        {
          p_branch_id: branch.id,
          p_customer_id:
            customerId || null,
          p_items: cart.map((item) => ({
            product_id: item.product_id,
            serial_number_id:
              item.serial_number_id,
            unit_price: item.unit_price,
          })),
          p_payment_method:
            paymentMethod,
          p_payment_amount: payment,
          p_payment_reference:
            paymentReference || null,
          p_discount_amount: discount,
          p_notes: notes || null,
        }
      );

    setLoading(false);

    if (checkoutError) {
      setError(checkoutError.message);
      return;
    }

    setSuccess(
      `Sale completed successfully. Sale ID: ${data}`
    );

    setCart([]);
    setCustomerId("");
    setProductId("");
    setSerialId("");
    setPaymentAmount("");
    setPaymentReference("");
    setDiscountAmount("0");
    setNotes("");

    router.refresh();
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          Point of Sale
        </h1>

        <p className="text-sm text-muted-foreground">
          {branch?.name ?? "No branch"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">

        {/* LEFT SIDE */}
        <div className="space-y-6">

          <div className="rounded-lg border p-5">
            <h2 className="mb-4 font-semibold">
              Customer
            </h2>

            <select
              value={customerId}
              onChange={(e) =>
                setCustomerId(e.target.value)
              }
              className="w-full rounded-md border bg-background p-2"
            >
              <option value="">
                Walk-in Customer
              </option>

              {customers.map((customer) => (
                <option
                  key={customer.id}
                  value={customer.id}
                >
                  {customer.customer_code} —{" "}
                  {customer.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-lg border p-5">
            <h2 className="mb-4 font-semibold">
              Add Product
            </h2>

            <div className="space-y-4">
              <select
                value={productId}
                onChange={(e) => {
                  setProductId(
                    e.target.value
                  );
                  setSerialId("");
                }}
                className="w-full rounded-md border bg-background p-2"
              >
                <option value="">
                  Select product
                </option>

                {inventory.map((item) => (
                  <option
                    key={item.id}
                    value={
                      item.product?.id ?? ""
                    }
                  >
                    {item.product?.sku} —{" "}
                    {item.product?.name} — ₱
                    {Number(
                      item.product
                        ?.selling_price ?? 0
                    ).toLocaleString()}
                  </option>
                ))}
              </select>

              <select
                value={serialId}
                onChange={(e) =>
                  setSerialId(
                    e.target.value
                  )
                }
                disabled={!productId}
                className="w-full rounded-md border bg-background p-2 disabled:opacity-50"
              >
                <option value="">
                  Select serial number
                </option>

                {availableSerials.map(
                  (serial) => (
                    <option
                      key={serial.id}
                      value={serial.id}
                    >
                      {
                        serial.serial_number
                      }
                    </option>
                  )
                )}
              </select>

              <button
                type="button"
                onClick={addToCart}
                className="rounded-md bg-white px-4 py-2 font-medium text-black"
              >
                Add to Cart
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE */}
        <div className="space-y-6">

          <div className="rounded-lg border p-5">
            <h2 className="mb-4 font-semibold">
              Cart
            </h2>

            {cart.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Cart is empty.
              </p>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => (
                  <div
                    key={
                      item.serial_number_id
                    }
                    className="flex items-start justify-between border-b pb-3"
                  >
                    <div>
                      <div className="font-medium">
                        {item.name}
                      </div>

                      <div className="text-sm text-muted-foreground">
                        {item.sku}
                      </div>

                      <div className="font-mono text-xs text-muted-foreground">
                        {
                          item.serial_number
                        }
                      </div>
                    </div>

                    <div className="text-right">
                      <div>
                        ₱
                        {Number(
                          item.unit_price
                        ).toLocaleString()}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          removeFromCart(
                            item.serial_number_id
                          )
                        }
                        className="mt-1 text-xs underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border p-5">
            <h2 className="mb-4 font-semibold">
              Payment
            </h2>

            <div className="space-y-4">

              <select
                value={paymentMethod}
                onChange={(e) => {
                setPaymentMethod(e.target.value);
                setPaymentAmount("");
                setPaymentReference("");
                }}


                className="w-full rounded-md border bg-background p-2"
              >
                <option value="cash">
                  Cash
                </option>
                <option value="gcash">
                  GCash
                </option>
                <option value="maya">
                  Maya
                </option>
                <option value="card">
                  Card
                </option>
                <option value="bank_transfer">
                  Bank Transfer
                </option>
              </select>

              <input
                type="number"
                value={discountAmount}
                onChange={(e) =>
                  setDiscountAmount(
                    e.target.value
                  )
                }
                placeholder="Discount"
                className="w-full rounded-md border bg-background p-2"
              />

                <div>
                <label className="mb-2 block text-sm font-medium">
                    {paymentMethod === "cash"
                    ? "Cash Tendered"
                    : "Payment Amount"}
                </label>

                <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={paymentAmount}
                    onChange={(e) =>
                    setPaymentAmount(e.target.value)
                    }
                    placeholder={
                    paymentMethod === "cash"
                        ? "Amount received from customer"
                        : "Amount paid"
                    }
                    className="w-full rounded-md border bg-background p-2"
                />
                </div>

              {paymentMethod !== "cash" && (
                <input
                  value={paymentReference}
                  onChange={(e) =>
                    setPaymentReference(
                      e.target.value
                    )
                  }
                  placeholder="Reference number"
                  className="w-full rounded-md border bg-background p-2"
                />
              )}

              <textarea
                value={notes}
                onChange={(e) =>
                  setNotes(e.target.value)
                }
                rows={2}
                placeholder="Optional notes"
                className="w-full rounded-md border bg-background p-2"
              />

                <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between">
                    <span>Subtotal</span>

                    <span>
                    ₱{subtotal.toLocaleString()}
                    </span>
                </div>

                <div className="flex justify-between">
                    <span>Discount</span>

                    <span>
                    -₱{discount.toLocaleString()}
                    </span>
                </div>

                <div className="flex justify-between text-lg font-bold">
                    <span>Amount Due</span>

                    <span>
                    ₱{total.toLocaleString()}
                    </span>
                </div>

                {paymentMethod === "cash" && (
                    <>
                    <div className="flex justify-between">
                        <span>Cash Tendered</span>

                        <span>
                        ₱{payment.toLocaleString()}
                        </span>
                    </div>

                    <div className="flex justify-between text-lg font-bold">
                        <span>Change</span>

                        <span>
                        ₱{change.toLocaleString()}
                        </span>
                    </div>
                    </>
                )}
                </div>

              {error && (
                <p className="text-sm text-red-500">
                  {error}
                </p>
              )}

              {success && (
                <p className="text-sm text-green-500">
                  {success}
                </p>
              )}

              <button
                type="button"
                onClick={checkout}
                disabled={
                  loading ||
                  cart.length === 0
                }
                className="w-full rounded-md bg-white px-4 py-3 font-semibold text-black disabled:opacity-50"
              >
                {loading
                  ? "Processing..."
                  : "Complete Sale"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}