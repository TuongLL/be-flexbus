import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../entities/user.entity';
import { ERROR_EXCEPTION, ResponseStatus, SUCCESS_EXCEPTION } from 'types';
import { v4 as uuidv4 } from 'uuid';
import { compare, hashPassword } from 'utils';
import { JwtService } from '@nestjs/jwt';
import { LoginDto, RegisterDto, SendOtpDto } from './dto';
import { UserLogin, UserRegister } from './types';
import * as phoneNumberToken from 'generate-sms-verification-code';

import { MailService } from 'src/mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel('users') private readonly userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
    private mailService: MailService,
  ) {}

  async login(userDto: LoginDto): Promise<ResponseStatus<UserLogin>> {
    const user = await this.userModel.findOne({ email: userDto.email }).lean();
    if (user && (await compare(userDto.password, user.password))) {
      return {
        code: HttpStatus.OK,
        message: SUCCESS_EXCEPTION.OK,
        data: {
          id: user._id,
          createdAt: user.createdAt,
          email: user.email,
          name: user.name,
          gender: user.gender,
          birthDay: user.birthDay,
          accessToken: this.jwtService.sign(user),
          phoneNumber: user.phoneNumber,
          active: user.active,
        },
      };
    }

    return {
      message: ERROR_EXCEPTION.LOGIN_FAILED,
      code: HttpStatus.UNAUTHORIZED,
    };
  }

  async register(userDto: RegisterDto): Promise<ResponseStatus<UserRegister>> {
    const user = await this.userModel.findOne({ email: userDto.email });
    if (user) {
      return {
        message: ERROR_EXCEPTION.USER_EXIST,
        code: HttpStatus.BAD_REQUEST,
      };
    }

    const otp = phoneNumberToken(6, { type: 'string' });

    const newUser = await this.userModel.create({
      ...userDto,
      otp,
      password: await hashPassword(userDto.password),
    });
    await this.mailService.sendUserConfirmation(newUser, otp);

    return {
      code: HttpStatus.OK,
      message: SUCCESS_EXCEPTION.OK,
      data: {
        createdAt: newUser.createdAt,
        email: newUser.email,
      },
    };
  }

  async otpVerify({ email, otp }: SendOtpDto): Promise<ResponseStatus<User>> {
    const user: UserDocument = await this.userModel.findOne({ email }).lean();
    if (otp != user.otp) {
      return {
        code: HttpStatus.UNAUTHORIZED,
        message: ERROR_EXCEPTION.UNAUTHORIZED,
      };
    }
    const user_res = await this.userModel
      .findByIdAndUpdate(user._id, { active: true })
      .lean();
    return {
      code: HttpStatus.OK,
      message: SUCCESS_EXCEPTION.OK,
      data: user_res,
    };
  }
}
