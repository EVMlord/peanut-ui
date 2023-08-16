import Link from "next/link";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useWeb3Modal } from "@web3modal/react";
import { useAtom } from "jotai";
import { useAccount, useNetwork, WalletClient } from "wagmi";
import { switchNetwork, getWalletClient } from "@wagmi/core";
import { providers } from "ethers";
import { useForm } from "react-hook-form";
import Select from "react-select";

const peanut = require("@squirrel-labs/peanut-sdk");

import * as store from "@/store";
import * as consts from "@/consts";
import * as _consts from "../send.consts";
import * as utils from "@/utils";
import * as hooks from "@/hooks";
import * as global_components from "@/components/global";
interface ISendFormData {
  chainId: number;
  token: string;
  amount: number;
}

export function SendInitialView({
  onNextScreen,
  setClaimLink,
  setTxReceipt,
  setChainId,
}: _consts.ISendScreenProps) {
  const { open } = useWeb3Modal();
  const { isConnected, address } = useAccount();
  const { chain: currentChain } = useNetwork();
  const [signer, setSigner] = useState<providers.JsonRpcSigner | undefined>(
    undefined
  );
  const [tokenList, setTokenList] = useState<ITokenListItem[]>([]);
  const [formHasBeenTouched, setFormHasBeenTouched] = useState(false);
  const [userBalances] = useAtom(store.userBalancesAtom);
  const [chainDetails] = useAtom(store.defaultChainDetailsAtom);
  const [supportedChainsSocketTech] = useAtom(
    store.supportedChainsSocketTechAtom
  );
  const [tokenDetails] = useAtom(store.defaultTokenDetailsAtom);
  const [prevChainId, setPrevChainId] = useState<number | undefined>(undefined);
  const [errorState, setErrorState] = useState<{
    showError: boolean;
    errorMessage: string;
  }>({ showError: false, errorMessage: "" });
  const [loadingStates, setLoadingStates] =
    useState<consts.LoadingStates>("idle");
  const isLoading = useMemo(() => loadingStates !== "idle", [loadingStates]);

  const [enableConfirmation, setEnableConfirmation] = useState(false);

  hooks.useConfirmRefresh(enableConfirmation);

  const sendForm = useForm<ISendFormData>({
    mode: "onChange",
    defaultValues: {
      chainId: 1,
      amount: 0,
      token: "",
    },
  });
  const formwatch = sendForm.watch();
  interface ITokenListItem {
    symbol: string;
    amount: number;
    chainId: number;
    address: string;
    decimals: number;
    logo: string;
  }

  function walletClientToSigner(walletClient: WalletClient) {
    const { account, chain, transport } = walletClient;
    const network = {
      chainId: chain.id,
      name: chain.name,
      ensAddress: chain.contracts?.ensRegistry?.address,
    };
    const provider = new providers.Web3Provider(transport, network);
    const signer = provider.getSigner(account.address);
    return signer;
  }

  const getWalletClientAndUpdateSigner = async ({
    chainId,
  }: {
    chainId: number;
  }) => {
    const walletClient = await getWalletClient({ chainId: Number(chainId) });
    if (walletClient) {
      const signer = walletClientToSigner(walletClient);
      setSigner(signer);
    }
  };

  const checkForm = (sendFormData: ISendFormData) => {
    //check that the token and chainid are defined
    if (sendFormData.chainId == null || sendFormData.token == "") {
      setErrorState({
        showError: true,
        errorMessage: "Please select a chain and token",
      });
      return { succes: "false" };
    }

    //check if the amount is less than or equal to zero
    if (sendFormData.amount <= 0) {
      setErrorState({
        showError: true,
        errorMessage: "Please put an amount that is greater than zero",
      });
      return { succes: "false" };
    }

    //check if the token is in the userBalances
    if (
      userBalances.some(
        (balance) =>
          balance.symbol == sendFormData.token &&
          balance.chainId == sendFormData.chainId
      )
    ) {
      //check that the user has enough funds
      const balance = userBalances.find(
        (balance) => balance.symbol === sendFormData.token
      )?.amount;
      if (balance && sendFormData.amount > balance) {
        setErrorState({
          showError: true,
          errorMessage: "You don't have enough funds",
        });
        return { succes: "false" };
      }

      if (!signer) {
        getWalletClientAndUpdateSigner({ chainId: sendFormData.chainId });
        setErrorState({
          showError: true,
          errorMessage: "Signer undefined, please refresh",
        });
        return { succes: "false" };
      }
    }
    return { succes: "true" };
  };

  const getTokenDetails = useCallback(
    (sendFormData: ISendFormData) => {
      let tokenAddress: string = "";
      let tokenDecimals: number = 18;
      if (
        userBalances.some(
          (balance) =>
            balance.symbol == sendFormData.token &&
            balance.chainId == sendFormData.chainId
        )
      ) {
        tokenAddress =
          userBalances.find(
            (balance) =>
              balance.chainId == sendFormData.chainId &&
              balance.symbol == sendFormData.token
          )?.address ?? "";
        tokenDecimals =
          userBalances.find(
            (balance) =>
              balance.chainId == sendFormData.chainId &&
              balance.symbol == sendFormData.token
          )?.decimals ?? 18;
      } else {
        tokenAddress =
          tokenDetails
            .find(
              (detail) =>
                detail.chainId.toString() == sendFormData.chainId.toString()
            )
            ?.tokens.find((token) => token.symbol == sendFormData.token)
            ?.address ?? "";

        tokenDecimals =
          tokenDetails
            .find(
              (detail) =>
                detail.chainId.toString() == sendFormData.chainId.toString()
            )
            ?.tokens.find((token) => token.symbol == sendFormData.token)
            ?.decimals ?? 18;
      }

      const tokenType =
        chainDetails.find((detail) => detail.chainId == sendFormData.chainId)
          ?.nativeCurrency.symbol == sendFormData.token
          ? 0
          : 1;

      return { tokenAddress, tokenDecimals, tokenType };
    },
    [userBalances, tokenDetails, chainDetails]
  );

  const createLink = useCallback(
    async (sendFormData: ISendFormData) => {
      setErrorState({ showError: false, errorMessage: "" });
      if (isLoading) return;
      try {
        setLoadingStates("checking inputs...");

        if (checkForm(sendFormData).succes === "false") {
          return;
        }
        setEnableConfirmation(true);

        const { tokenAddress, tokenDecimals, tokenType } =
          getTokenDetails(sendFormData);

        console.log(
          "sending " +
            sendFormData.amount +
            " " +
            sendFormData.token +
            " on chain with id " +
            sendFormData.chainId +
            " with token address: " +
            tokenAddress +
            " with tokenType: " +
            tokenType +
            " with tokenDecimals: " +
            tokenDecimals
        );

        setLoadingStates("allow network switch...");
        //check if the user is on the correct chain
        if (currentChain?.id.toString() !== sendFormData.chainId.toString()) {
          await utils
            .waitForPromise(
              switchNetwork({ chainId: Number(sendFormData.chainId) })
            )
            .catch((error) => {
              setErrorState({
                showError: true,
                errorMessage: "Something went wrong while switching networks",
              });
              return;
            });
          setLoadingStates("switching network...");
          await new Promise((resolve) => setTimeout(resolve, 4000)); // wait a sec after switching chain before making other deeplink
          setLoadingStates("loading...");
        }

        //when the user tries to refresh, show an alert
        setEnableConfirmation(true);
        setLoadingStates("executing transaction...");

        const { link, txReceipt } = await peanut.createLink({
          signer: signer,
          chainId: sendFormData.chainId,
          tokenAddress: tokenAddress ?? null,
          tokenAmount: Number(sendFormData.amount),
          tokenType: tokenType,
          tokenDecimals: tokenDecimals,
          verbose: true,
        });
        console.log("Created link:", link);
        utils.saveToLocalStorage(address + " - " + txReceipt.hash, link);

        setClaimLink(link);
        setTxReceipt(txReceipt);
        setChainId(sendFormData.chainId);

        onNextScreen();
      } catch (error: any) {
        if (error.toString().includes("insufficient funds")) {
          setErrorState({
            showError: true,
            errorMessage: "You don't have enough funds",
          });
        } else {
          setErrorState({
            showError: true,
            errorMessage:
              "Something failed while creating your link. Please try again",
          });
          console.error(error);
        }
      } finally {
        setLoadingStates("idle");
        setEnableConfirmation(false);
      }
    },
    [signer, currentChain, userBalances, onNextScreen, isLoading, address]
  );

  useEffect(() => {
    userBalances.some((balance) => balance.chainId == formwatch.chainId)
      ? setTokenList(
          userBalances
            .filter((balance) => balance.chainId == formwatch.chainId)
            .map((balance) => {
              return {
                symbol: balance.symbol,
                chainId: balance.chainId,
                amount: balance.amount,
                address: balance.address,
                decimals: balance.decimals,
                logo: "",
              };
            })
        )
      : setTokenList([]);
  }, [formwatch.chainId, userBalances, supportedChainsSocketTech]);

  // use this useEffect if you want to populate the tokendropdown with a lot of tokens. This is not recommended bc heavy af
  // useEffect(() => {
  //   if (
  //     supportedChainsSocketTech?.some(
  //       (chain) => chain.chainId == formwatch.chainId
  //     )
  //   ) {
  //     userBalances.some((balance) => balance.chainId == formwatch.chainId)
  //       ? setTokenList(
  //           userBalances
  //             .filter((balance) => balance.chainId == formwatch.chainId)
  //             .map((balance) => {
  //               return {
  //                 symbol: balance.symbol,
  //                 chainId: balance.chainId,
  //                 amount: balance.amount,
  //                 address: balance.address,
  //                 decimals: balance.decimals,
  //                 logo: "",
  //               };
  //             })
  //         )
  //       : setTokenList(
  //           tokenDetails
  //             .filter(
  //               (detail) =>
  //                 detail.chainId.toString() == formwatch.chainId.toString()
  //             )[0]
  //             .tokens.map((token) => {
  //               return {
  //                 symbol: token.symbol,
  //                 amount: 0,
  //                 chainId: formwatch.chainId,
  //                 address: token.address,
  //                 decimals: token.decimals,
  //                 logo: token.logoURI ?? "",
  //               };
  //             })
  //         );
  //   } else {
  //     setTokenList(
  //       tokenDetails
  //         .filter(
  //           (detail) =>
  //             detail.chainId.toString() == formwatch.chainId.toString()
  //         )[0]
  //         ?.tokens.map((token) => {
  //           return {
  //             symbol: token.symbol,
  //             amount: 0,
  //             chainId: formwatch.chainId,
  //             address: token.address,
  //             decimals: token.decimals,
  //             logo: token.logoURI ?? "",
  //           };
  //         })
  //     );
  //   }
  // }, [formwatch.chainId, userBalances, supportedChainsSocketTech]);

  const customChainOption = ({
    value,
    label,
    logoUri,
  }: {
    value: number;
    label: string;
    logoUri: string;
  }) => (
    <div>
      {/* <img src={logoUri} className="w-6 h-6 inline-block mr-2" /> */}
      <span>{label}</span>
    </div>
  );

  const customTokenOption = ({
    value,
    label,
    logoUri,
    amount,
  }: {
    value: string;
    label: string;
    logoUri: string;
    amount: number;
  }) => (
    <div className="flex flex-row gap-2 align-center ">
      {/* <img src={logoUri ?? ""} /> */}
      {value}

      {amount > 0 && " - " + Math.round(amount * 10000) / 10000}
    </div>
  );

  useEffect(() => {
    if (currentChain && !formHasBeenTouched) {
      sendForm.setValue("chainId", currentChain.id);
    }
  }, [currentChain]);

  useEffect(() => {
    if (formwatch.chainId != prevChainId) {
      setPrevChainId(formwatch.chainId);
      sendForm.setValue("token", "");

      //wait for the wallet to connect
      setTimeout(() => {
        getWalletClientAndUpdateSigner({ chainId: formwatch.chainId });
      }, 2000);
    }
  }, [formwatch.chainId, isConnected]);

  return (
    <>
      <div className="mt-6 text-center  w-full flex flex-col gap-5 ">
        <h2 className="title-font text-3xl lg:text-5xl bold m-0">
          Send crypto with a link
          <span className="text-teal font-bold text-lg lg:text-2xl ml-2">
            BETA
          </span>
        </h2>
        <h3 className="text-lg lg:text-2xl font-bold m-0">
          Peanut Protocol Demo
        </h3>

        <div className="text-base p-5 px-6 w-11/12 lg:w-2/3 mx-auto m-0">
          Choose the chain, set the amount, confirm the transaction. You'll get
          a trustless payment link. Send it to whomever you want.
        </div>
      </div>
      <form className="w-full" onSubmit={sendForm.handleSubmit(createLink)}>
        <div className="flex w-full flex-col gap-5 items-center">
          <div className="flex gap-2 w-full px-2 sm:w-3/4 lg:w-3/5">
            <div className="relative w-full lg:max-w-sm">
              <Select
                noOptionsMessage={() => "no chains found"}
                value={{
                  value: formwatch.chainId,
                  label:
                    chainDetails.find(
                      (chain) => chain.chainId == formwatch.chainId
                    )?.name ?? "",
                  logoUri: "",
                }}
                placeholder="Select chain..."
                styles={{
                  control: (provided) => ({
                    ...provided,
                    backgroundColor: "white",
                    borderColor: "black !important",
                    borderWidth: "2px",
                    borderRadius: "0px",
                  }),
                  option: (provided, state) => ({
                    ...provided,
                    backgroundColor: state.isFocused ? "black" : "white",
                    color: state.isFocused ? "white" : "black",
                  }),
                }}
                options={chainDetails.map((detail) => {
                  return {
                    value: detail.chainId,
                    label: detail.name,
                    logoUri: detail.hasOwnProperty("icon")
                      ? detail.icon[0].url
                      : "",
                  };
                })}
                formatOptionLabel={customChainOption}
                onChange={(option) => {
                  setFormHasBeenTouched(true);
                  if (option && option.value)
                    sendForm.setValue("chainId", option.value);
                }}
                isSearchable={false}
              />
            </div>
            <div className="relative w-full lg:max-w-sm">
              <Select
                noOptionsMessage={() => "No tokens found"}
                value={{
                  value: formwatch.token,
                  label: formwatch.token,
                  logoUri: "",
                  amount: 0,
                }}
                placeholder="Select token..."
                styles={{
                  control: (provided) => ({
                    ...provided,
                    backgroundColor: "white",
                    borderColor: "black !important",
                    borderWidth: "2px",
                    borderRadius: "0px",
                  }),
                  option: (provided, state) => ({
                    ...provided,
                    backgroundColor: state.isFocused ? "black" : "white",
                    color: state.isFocused ? "white" : "black",
                  }),
                }}
                options={tokenList?.map((token) => {
                  return {
                    value: token.symbol,
                    label: token.symbol,
                    logoUri: token.logo,
                    amount: token.amount,
                  };
                })}
                formatOptionLabel={customTokenOption}
                onChange={(option) => {
                  setFormHasBeenTouched(true);
                  if (option && option.value)
                    sendForm.setValue("token", option.value);
                }}
                isSearchable={false}
              />
            </div>
          </div>
          <div className="relative w-full px-2 sm:w-3/4 ">
            {formwatch.token && (
              <div className="absolute box-border inset-y-0 right-4 flex items-center ">
                <span className="cursor-pointertext-lg h-1/2 flex align-center ">
                  <button
                    type="button"
                    className={
                      "relative inline-flex items-center border-2 border-black p-1  sm:p-2  bg-black text-white color-white h-full min-w-75 justify-center"
                    }
                  >
                    {formwatch.token}
                  </button>
                </span>
              </div>
            )}

            <input
              type="number"
              step="any"
              min="0"
              autoComplete="off"
              className="no-spin block w-full py-4 px-2 brutalborder pl-4 placeholder:text-lg placeholder:text-black placeholder:font-bold font-bold text-lg outline-none appearance-none "
              placeholder="0.00"
              aria-describedby="price-currency"
              {...(sendForm.register("amount"),
              {
                onChange: (e) => {
                  sendForm.setValue("amount", Number(e.target.value));
                  setFormHasBeenTouched(true);
                },
              })}
            />
          </div>

          <div
            className={
              errorState.showError
                ? "w-full flex flex-col items-center gap-10 my-8 mx-auto mb-0 "
                : "w-full flex flex-col items-center my-8 mx-auto mb-14 "
            }
          >
            <button
              type={isConnected ? "submit" : "button"}
              className="block w-full px-2 sm:w-2/5 lg:w-1/2 p-5  font-black text-2xl cursor-pointer bg-white"
              id="cta-btn"
              onClick={!isConnected ? open : undefined}
              disabled={isLoading ? true : false}
            >
              {isLoading
                ? loadingStates
                : isConnected
                ? "Send"
                : "Connect Wallet"}
            </button>
            {errorState.showError && (
              <div className="text-center">
                <label className="text-red font-bold ">
                  {errorState.errorMessage}
                </label>
              </div>
            )}
          </div>
        </div>
      </form>
      <div>
        <h4>
          Hit us up on{" "}
          <Link className="text-black" href={""}>
            Discord
          </Link>
          !
        </h4>
      </div>

      <global_components.PeanutMan type={"presenting"} />
    </>
  );
}
