import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";

export type AddressStackParamList = {
    ManageAddresses: undefined;
    AddressForm: { addressId?: string } | undefined;
};

export type ManageAddressesScreenProps = NativeStackScreenProps<AddressStackParamList, "ManageAddresses">;
export type AddressFormScreenProps = NativeStackScreenProps<AddressStackParamList, "AddressForm">;

export type ManageAddressesNavigation = NativeStackNavigationProp<AddressStackParamList, "ManageAddresses">;
export type AddressFormNavigation = NativeStackNavigationProp<AddressStackParamList, "AddressForm">;
